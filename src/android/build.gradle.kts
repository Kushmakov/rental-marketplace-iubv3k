// Root-level build configuration for Project X Android application
// Version: 1.0.0
// Last Updated: 2023

buildscript {
    repositories {
        google() // Android Gradle Plugin - v8.1.0
        mavenCentral() // Primary Maven repository
        gradlePluginPortal() // Gradle plugin repository
    }
    
    dependencies {
        // Core build tools
        classpath("com.android.tools.build:gradle:8.1.0") // Android Gradle Plugin
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0") // Kotlin Gradle Plugin
        
        // Dependency injection
        classpath("com.google.dagger:hilt-android-gradle-plugin:2.47") // Hilt DI
        
        // Build and dependency management
        classpath("com.github.ben-manes:gradle-versions-plugin:0.47.0") // Dependency updates
        classpath("org.owasp:dependency-check-gradle:8.3.1") // Security vulnerability scanning
    }
}

// Project-wide configuration
allprojects {
    repositories {
        google()
        mavenCentral()
    }

    // Dependency resolution strategy
    configurations.all {
        resolutionStrategy {
            // Fail fast on version conflicts for better dependency management
            failOnVersionConflict()
            
            // Prefer project modules over external dependencies
            preferProjectModules()
            
            // Cache changing modules for 4 hours to optimize build performance
            cacheChangingModulesFor(4, "hours")
            
            // Force specific versions for core dependencies
            force(
                "org.jetbrains.kotlin:kotlin-stdlib:1.9.0",
                "org.jetbrains.kotlin:kotlin-stdlib-common:1.9.0",
                "org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3",
                "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3"
            )
        }
    }
}

// Kotlin compilation configuration
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    kotlinOptions {
        // Target JVM 17 for modern features and optimizations
        jvmTarget = "17"
        
        // Enable explicit API mode for better API management
        apiVersion = "1.9"
        languageVersion = "1.9"
        
        // Enable compiler optimizations
        freeCompilerArgs = listOf(
            "-Xopt-in=kotlin.RequiresOptIn",
            "-Xopt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
            "-Xjvm-default=all",
            "-Xcontext-receivers"
        )
        
        // Enable parallel compilation
        allWarningsAsErrors = true
        
        // Enable incremental compilation
        incremental = true
    }
}

// Clean task configuration
tasks.register<Delete>("clean") {
    delete(rootProject.buildDir)
    // Clean build cache if specified
    if (project.hasProperty("cleanBuildCache")) {
        delete(layout.buildDirectory.dir("build-cache"))
    }
}

// Dependency updates task configuration
tasks.register("dependencyUpdates") {
    // Check for dependency updates
    dependsOn("dependencyUpdatesMain")
    
    // Run security vulnerability check
    dependsOn("dependencyCheckAnalyze")
    
    doLast {
        // Generate dependency report
        println("Dependency update check completed")
        // Validate version constraints
        println("Security vulnerability scan completed")
    }
}

// Apply common plugins
plugins {
    // Android application plugin
    id("com.android.application") version "8.1.0" apply false
    
    // Kotlin plugins
    id("org.jetbrains.kotlin.android") version "1.9.0" apply false
    id("org.jetbrains.kotlin.kapt") version "1.9.0" apply false
    
    // Dependency injection
    id("com.google.dagger.hilt.android") version "2.47" apply false
    
    // Dependency management
    id("com.github.ben-manes.versions") version "0.47.0"
    
    // Security scanning
    id("org.owasp.dependencycheck") version "8.3.1"
}

// Project-wide dependency versions
extra["versions"] = mapOf(
    "kotlin" to "1.9.0",
    "android_gradle_plugin" to "8.1.0",
    "hilt" to "2.47",
    "androidx_core" to "1.10.1",
    "androidx_appcompat" to "1.6.1",
    "material" to "1.9.0",
    "lifecycle" to "2.6.1",
    "navigation" to "2.7.1",
    "room" to "2.5.2",
    "retrofit" to "2.9.0",
    "okhttp" to "4.11.0",
    "moshi" to "1.15.0",
    "coroutines" to "1.7.3",
    "stripe" to "20.28.1",
    "junit" to "4.13.2",
    "mockito" to "5.4.0",
    "espresso" to "3.5.1"
)