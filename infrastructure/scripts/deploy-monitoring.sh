#!/bin/bash

# Deploy Monitoring Stack Script v1.0.0
# Deploys and configures a highly available monitoring stack with Prometheus, Grafana, and ELK
# for the Project X Rental Platform with comprehensive alerting and security controls.

set -euo pipefail

# Global Variables
readonly MONITORING_NAMESPACE="monitoring"
readonly PROMETHEUS_VERSION="45.7.1"
readonly GRAFANA_VERSION="6.57.3"
readonly ELK_VERSION="8.9.0"
readonly HA_REPLICA_COUNT=3
readonly BACKUP_RETENTION_DAYS=30
readonly ALERT_SEVERITY_LEVELS=("critical" "warning" "info")
readonly SECURITY_COMPLIANCE_MODE="strict"

# Utility Functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

check_prerequisites() {
    local tools=("kubectl" "helm" "velero")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log "ERROR: Required tool $tool is not installed"
            exit 1
        fi
    done
}

create_monitoring_namespace() {
    kubectl create namespace "$MONITORING_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply RBAC policies
    kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: monitoring-role
rules:
  - apiGroups: [""]
    resources: ["nodes", "pods", "services", "endpoints"]
    verbs: ["get", "list", "watch"]
EOF

    kubectl create clusterrolebinding monitoring-binding \
        --clusterrole=monitoring-role \
        --serviceaccount="$MONITORING_NAMESPACE:default"
}

deploy_prometheus() {
    local namespace=$1
    local values_file=$2
    
    log "Deploying Prometheus stack version $PROMETHEUS_VERSION"
    
    # Add Prometheus helm repo
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    
    # Deploy Prometheus with HA configuration
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace "$namespace" \
        --version "$PROMETHEUS_VERSION" \
        --values "$values_file" \
        --set prometheusOperator.replicaCount="$HA_REPLICA_COUNT" \
        --set prometheus.prometheusSpec.retention="${BACKUP_RETENTION_DAYS}d" \
        --set prometheus.prometheusSpec.replicaCount="$HA_REPLICA_COUNT"
        
    # Apply custom alert rules
    kubectl apply -f infrastructure/monitoring/prometheus/rules/alerts.yml -n "$namespace"
    kubectl apply -f infrastructure/monitoring/prometheus/rules/recording.yml -n "$namespace"
    
    # Configure backups
    velero schedule create prometheus-backup \
        --schedule="@daily" \
        --include-namespaces "$namespace" \
        --ttl "${BACKUP_RETENTION_DAYS}h"
}

deploy_grafana() {
    local namespace=$1
    local values_file=$2
    
    log "Deploying Grafana version $GRAFANA_VERSION"
    
    # Add Grafana helm repo
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    
    # Deploy Grafana with HA configuration
    helm upgrade --install grafana grafana/grafana \
        --namespace "$namespace" \
        --version "$GRAFANA_VERSION" \
        --values "$values_file" \
        --set replicas="$HA_REPLICA_COUNT" \
        --set persistence.enabled=true
        
    # Import dashboards
    kubectl apply -f infrastructure/monitoring/grafana/dashboards/ -n "$namespace"
    
    # Configure backups
    velero schedule create grafana-backup \
        --schedule="@daily" \
        --include-namespaces "$namespace" \
        --ttl "${BACKUP_RETENTION_DAYS}h"
}

deploy_elk() {
    local namespace=$1
    local values_file=$2
    
    log "Deploying ELK stack version $ELK_VERSION"
    
    # Add Elastic helm repo
    helm repo add elastic https://helm.elastic.co
    helm repo update
    
    # Deploy Elasticsearch with security and HA
    helm upgrade --install elasticsearch elastic/elasticsearch \
        --namespace "$namespace" \
        --version "$ELK_VERSION" \
        --values "$values_file" \
        --set replicas="$HA_REPLICA_COUNT" \
        --set securityContext.enabled=true
        
    # Deploy Kibana
    helm upgrade --install kibana elastic/kibana \
        --namespace "$namespace" \
        --version "$ELK_VERSION" \
        --set elasticsearch.hosts=["elasticsearch-master:9200"]
        
    # Configure index lifecycle policies
    kubectl apply -f - <<EOF
apiVersion: elasticsearch.k8s.elastic.co/v1
kind: Elasticsearch
metadata:
  name: logging
  namespace: $namespace
spec:
  version: $ELK_VERSION
  nodeSets:
  - name: default
    count: $HA_REPLICA_COUNT
    config:
      node.store.allow_mmap: false
EOF
}

configure_alerting() {
    local namespace=$1
    local rules_file=$2
    
    log "Configuring alerting system"
    
    # Deploy AlertManager
    kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: AlertmanagerConfig
metadata:
  name: main-alerts
  namespace: $namespace
spec:
  route:
    receiver: 'default'
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    routes:
    - receiver: 'critical'
      match:
        severity: critical
      group_wait: 10s
    - receiver: 'warning'
      match:
        severity: warning
  receivers:
  - name: 'default'
    pagerduty_configs:
    - service_key: ${PAGERDUTY_KEY}
  - name: 'critical'
    pagerduty_configs:
    - service_key: ${PAGERDUTY_CRITICAL_KEY}
  - name: 'warning'
    slack_configs:
    - api_url: ${SLACK_WEBHOOK_URL}
      channel: '#alerts'
EOF
}

main() {
    log "Starting monitoring stack deployment"
    
    # Check prerequisites
    check_prerequisites
    
    # Create namespace and RBAC
    create_monitoring_namespace
    
    # Deploy monitoring components
    deploy_prometheus "$MONITORING_NAMESPACE" "prometheus-values.yaml"
    deploy_grafana "$MONITORING_NAMESPACE" "grafana-values.yaml"
    deploy_elk "$MONITORING_NAMESPACE" "elk-values.yaml"
    
    # Configure alerting
    configure_alerting "$MONITORING_NAMESPACE" "alert-rules.yaml"
    
    log "Monitoring stack deployment completed successfully"
}

# Execute main function
main "$@"