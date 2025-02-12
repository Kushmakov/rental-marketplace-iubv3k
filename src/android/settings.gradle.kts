// Plugin Management Configuration - v8.1.0
pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
    
    plugins {
        // Android Build Tools - v8.1.0
        id("com.android.application") version "8.1.0"
        
        // Kotlin Plugins - v1.9.0
        id("org.jetbrains.kotlin.android") version "1.9.0"
        id("org.jetbrains.kotlin.kapt") version "1.9.0"
        
        // Dependency Injection - v2.47
        id("com.google.dagger.hilt.android") version "2.47"
        
        // Build Monitoring - v3.15.1
        id("com.gradle.enterprise") version "3.15.1"
        
        // Security - v1.0.1
        id("org.gradle.security.dependency-verification") version "1.0.1"
    }
}

// Enable Gradle Feature Preview for Version Catalogs
enableFeaturePreview("VERSION_CATALOGS")

// Dependency Resolution Management
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
    
    // Security Configuration for Dependencies
    verificationMode.set(VerificationMode.STRICT)
    checksums {
        sha256.set(true)
        sha512.set(true)
    }
}

// Gradle Enterprise Configuration for Build Monitoring
gradleEnterprise {
    buildScan {
        termsOfServiceUrl = "https://gradle.com/terms-of-service"
        termsOfServiceAgree = "yes"
        publishAlways()
        
        // Tag builds for better tracking
        tag("android")
        tag("rental-marketplace")
        
        // Capture build performance metrics
        capture {
            isTaskInputFiles = true
            isTaskOutputFiles = true
            isFileDownloads = true
        }
        
        // Upload build scans for enterprise monitoring
        uploadInBackground = false
        server = "https://ge.projectx.com"
    }
}

// Root Project Configuration
rootProject.name = "ProjectX"

// Include Application Module
include(":app")

// Build Cache Configuration
buildCache {
    local {
        isEnabled = true
        directory = File(rootDir, "build-cache")
        removeUnusedEntriesAfterDays = 7
    }
    remote<HttpBuildCache> {
        isEnabled = true
        url = uri("https://cache.projectx.com/cache/")
        credentials {
            username = System.getenv("GRADLE_CACHE_USERNAME")
            password = System.getenv("GRADLE_CACHE_PASSWORD")
        }
    }
}

// Configuration for Build Performance
gradle.projectsLoaded {
    rootProject.allprojects {
        configurations.all {
            resolutionStrategy {
                // Cache dynamic versions for 10 minutes
                cacheDynamicVersionsFor(10, "minutes")
                
                // Cache changing modules for 4 hours
                cacheChangingModulesFor(4, "hours")
                
                // Fail fast on version conflicts
                failOnVersionConflict()
                
                // Force specific versions for core dependencies
                force(
                    "org.jetbrains.kotlin:kotlin-stdlib:1.9.0",
                    "org.jetbrains.kotlin:kotlin-stdlib-common:1.9.0"
                )
            }
        }
    }
}