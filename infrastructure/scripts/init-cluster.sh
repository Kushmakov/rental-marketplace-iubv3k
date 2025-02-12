#!/usr/bin/env bash

# Project X Rental Platform - EKS Cluster Initialization Script
# Version: 1.0.0
# This script initializes and configures an EKS cluster with enhanced security,
# monitoring, and high availability features for the rental platform.

set -euo pipefail
IFS=$'\n\t'

# Required tool versions
readonly REQUIRED_KUBECTL_VERSION="1.27.0"
readonly REQUIRED_EKSCTL_VERSION="0.150.0"
readonly REQUIRED_HELM_VERSION="3.0.0"
readonly REQUIRED_AWS_CLI_VERSION="2.0.0"

# Global configuration
CLUSTER_NAME="${PROJECT_NAME:-projectx}-${ENVIRONMENT:-production}-cluster"
REGION="${AWS_REGION:-us-east-1}"
NAMESPACE="projectx"
LOG_LEVEL="${LOG_LEVEL:-info}"
BACKUP_RETENTION="${BACKUP_RETENTION:-30}"
MONITORING_ENABLED="${MONITORING_ENABLED:-true}"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Check prerequisites and validate environment
check_prerequisites() {
    local environment="$1"
    log_info "Checking prerequisites for environment: $environment"

    # Verify required tools
    command -v kubectl >/dev/null 2>&1 || { log_error "kubectl is required but not installed"; exit 1; }
    command -v eksctl >/dev/null 2>&1 || { log_error "eksctl is required but not installed"; exit 1; }
    command -v helm >/dev/null 2>&1 || { log_error "helm is required but not installed"; exit 1; }
    command -v aws >/dev/null 2>&1 || { log_error "aws-cli is required but not installed"; exit 1; }

    # Check versions
    local kubectl_version=$(kubectl version --client -o json | jq -r '.clientVersion.gitVersion' | cut -d'v' -f2)
    if [[ "$(printf '%s\n' "$REQUIRED_KUBECTL_VERSION" "$kubectl_version" | sort -V | head -n1)" != "$REQUIRED_KUBECTL_VERSION" ]]; then
        log_error "kubectl version $REQUIRED_KUBECTL_VERSION or higher is required"
        exit 1
    fi

    # Verify AWS credentials
    aws sts get-caller-identity >/dev/null 2>&1 || { log_error "Invalid AWS credentials"; exit 1; }

    # Check required environment variables
    [[ -z "${PROJECT_NAME:-}" ]] && { log_error "PROJECT_NAME environment variable is required"; exit 1; }
    [[ -z "${ENVIRONMENT:-}" ]] && { log_error "ENVIRONMENT environment variable is required"; exit 1; }

    # Validate environment value
    if [[ ! "$environment" =~ ^(dev|staging|prod)$ ]]; then
        log_error "Invalid environment. Must be one of: dev, staging, prod"
        exit 1
    }

    log_info "Prerequisites check completed successfully"
    return 0
}

# Configure cluster security
configure_security() {
    log_info "Configuring cluster security"

    # Create service accounts with IRSA
    eksctl create iamserviceaccount \
        --cluster="$CLUSTER_NAME" \
        --namespace="$NAMESPACE" \
        --name="cluster-autoscaler" \
        --attach-policy-arn="arn:aws:iam::aws:policy/AutoScalingFullAccess" \
        --approve

    # Apply network policies
    kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: $NAMESPACE
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
EOF

    # Configure pod security policies
    kubectl apply -f - <<EOF
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  hostNetwork: false
  hostIPC: false
  hostPID: false
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  supplementalGroups:
    rule: 'MustRunAs'
    ranges:
      - min: 1
        max: 65535
  fsGroup:
    rule: 'MustRunAs'
    ranges:
      - min: 1
        max: 65535
  readOnlyRootFilesystem: true
EOF

    # Setup KMS encryption
    eksctl utils enable-secrets-encryption \
        --cluster="$CLUSTER_NAME" \
        --region="$REGION"

    log_info "Security configuration completed"
    return 0
}

# Deploy monitoring stack
deploy_monitoring() {
    if [[ "$MONITORING_ENABLED" != "true" ]]; then
        log_info "Monitoring is disabled, skipping deployment"
        return 0
    }

    log_info "Deploying monitoring stack"

    # Add Helm repositories
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update

    # Deploy Prometheus Operator
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --create-namespace \
        --set prometheus.prometheusSpec.retention="$BACKUP_RETENTION"d \
        --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi \
        --values - <<EOF
grafana:
  adminPassword: "${GRAFANA_ADMIN_PASSWORD:-admin}"
  persistence:
    enabled: true
    size: 10Gi
  dashboards:
    default:
      cluster-metrics:
        gnetId: 315
        revision: 2
        datasource: Prometheus
      node-metrics:
        gnetId: 1860
        revision: 23
        datasource: Prometheus
alertmanager:
  config:
    global:
      resolve_timeout: 5m
    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 12h
      receiver: 'null'
      routes:
      - match:
          alertname: Watchdog
        receiver: 'null'
    receivers:
    - name: 'null'
EOF

    # Deploy ELK stack
    helm upgrade --install elasticsearch elastic/elasticsearch \
        --namespace logging \
        --create-namespace \
        --set replicas=3 \
        --set minimumMasterNodes=2

    helm upgrade --install filebeat elastic/filebeat \
        --namespace logging \
        --set daemonset.enabled=true

    helm upgrade --install kibana elastic/kibana \
        --namespace logging \
        --set service.type=LoadBalancer

    log_info "Monitoring stack deployment completed"
    return 0
}

# Configure high availability
configure_ha() {
    log_info "Configuring high availability"

    # Deploy cluster autoscaler
    helm upgrade --install cluster-autoscaler autoscaler/cluster-autoscaler \
        --namespace kube-system \
        --set autoDiscovery.clusterName="$CLUSTER_NAME" \
        --set awsRegion="$REGION" \
        --set extraArgs.scale-down-delay-after-add=10m \
        --set extraArgs.scale-down-unneeded-time=10m

    # Configure pod disruption budgets
    kubectl apply -f - <<EOF
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-pdb
  namespace: $NAMESPACE
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: api-gateway
EOF

    # Setup backup procedures
    kubectl apply -f - <<EOF
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: daily-backup
  namespace: velero
spec:
  schedule: "0 0 * * *"
  template:
    includedNamespaces:
    - $NAMESPACE
    - monitoring
    - logging
    ttl: "${BACKUP_RETENTION}d"
EOF

    log_info "High availability configuration completed"
    return 0
}

# Main initialization function
init_cluster() {
    local environment="${1:-}"
    if [[ -z "$environment" ]]; then
        log_error "Environment parameter is required"
        exit 1
    }

    log_info "Starting cluster initialization for environment: $environment"

    # Check prerequisites
    check_prerequisites "$environment" || exit 1

    # Create EKS cluster using eksctl
    eksctl create cluster \
        --name="$CLUSTER_NAME" \
        --region="$REGION" \
        --version=1.27 \
        --nodes-min=2 \
        --nodes-max=10 \
        --node-type=t3.xlarge \
        --with-oidc \
        --ssh-access \
        --ssh-public-key=cluster-key \
        --managed \
        --full-ecr-access \
        --alb-ingress-access \
        --node-private-networking

    # Configure security
    configure_security || exit 1

    # Deploy monitoring
    deploy_monitoring || exit 1

    # Configure high availability
    configure_ha || exit 1

    log_info "Cluster initialization completed successfully"
    return 0
}

# Cleanup function
cleanup() {
    log_info "Starting cleanup process"

    # Delete cluster
    eksctl delete cluster \
        --name="$CLUSTER_NAME" \
        --region="$REGION" \
        --wait

    log_info "Cleanup completed"
    return 0
}

# Update function
update() {
    log_info "Starting cluster update process"

    # Update cluster version
    eksctl upgrade cluster \
        --name="$CLUSTER_NAME" \
        --region="$REGION" \
        --approve

    # Update node groups
    eksctl upgrade nodegroup \
        --cluster="$CLUSTER_NAME" \
        --region="$REGION" \
        --name=ng-1 \
        --kubernetes-version=1.27

    log_info "Cluster update completed"
    return 0
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        "init")
            init_cluster "${2:-}"
            ;;
        "cleanup")
            cleanup
            ;;
        "update")
            update
            ;;
        *)
            echo "Usage: $0 {init|cleanup|update} [environment]"
            exit 1
            ;;
    esac
fi