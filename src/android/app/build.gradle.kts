plugins {
    id("com.android.application") version "8.1.0"
    id("org.jetbrains.kotlin.android") version "1.9.0"
    id("org.jetbrains.kotlin.kapt") version "1.9.0"
    id("com.google.dagger.hilt.android") version "2.47"
    id("org.jetbrains.kotlin.plugin.parcelize") version "1.9.0"
    id("org.jetbrains.kotlinx.kover") version "0.7.3"
}

android {
    namespace = "com.projectx.rental"
    compileSdk = 34
    buildToolsVersion = "34.0.0"

    defaultConfig {
        applicationId = "com.projectx.rental"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        testInstrumentationRunnerArguments += mapOf(
            "clearPackageData" to "true"
        )

        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
        dataBinding = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Security configurations for release
            buildConfigField("String", "API_BASE_URL", "\"https://api.projectx.com/\"")
            buildConfigField("Boolean", "ENABLE_STRICT_MODE", "false")
        }
        debug {
            isDebuggable = true
            // Enable strict mode for debug builds
            buildConfigField("String", "API_BASE_URL", "\"https://api.staging.projectx.com/\"")
            buildConfigField("Boolean", "ENABLE_STRICT_MODE", "true")
            // Enable debugging features
            enableUnitTestCoverage = true
            enableAndroidTestCoverage = true
        }
        create("staging") {
            initWith(getByName("debug"))
            // Staging-specific configurations
            buildConfigField("String", "API_BASE_URL", "\"https://api.staging.projectx.com/\"")
            matchingFallbacks += listOf("debug")
        }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
        execution = "ANDROIDX_TEST_ORCHESTRATOR"
        animationsDisabled = true
        unitTests.all {
            it.maxParallelForks = Runtime.getRuntime().availableProcessors()
            it.maxHeapSize = "2048m"
        }
    }

    kotlinOptions {
        jvmTarget = "17"
        apiVersion = "1.9"
        languageVersion = "1.9"
        freeCompilerArgs += listOf(
            "-opt-in=kotlin.RequiresOptIn",
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi"
        )
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // AndroidX Core Libraries - v1.10.1
    implementation("androidx.core:core-ktx:1.10.1")
    
    // Security Libraries
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.biometric:biometric:1.2.0-alpha05")
    
    // Google Play Services
    implementation("com.google.android.play:app-update-ktx:2.1.0")
    implementation("com.google.android.play:integrity:1.1.0")
    
    // Debug Dependencies
    debugImplementation("com.squareup.leakcanary:leakcanary-android:2.12")
    
    // Testing Dependencies
    testImplementation("junit:junit:4.13.2")
    testImplementation("io.mockk:mockk:1.13.5")
    
    // Android Testing Dependencies
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation("androidx.test.orchestrator:orchestrator:1.4.2")
}

// Kover Configuration for Code Coverage
kover {
    enabled = true
    coverageEngine.set(kotlinx.kover.api.CoverageEngine.INTELLIJ)
    generateReportOnCheck = true
    
    filters {
        classes {
            excludes += listOf(
                "*Fragment",
                "*Activity",
                "*Module",
                "*.BuildConfig"
            )
        }
    }
    
    xmlReport {
        onCheck.set(true)
        reportFile.set(layout.buildDirectory.file("reports/kover/coverage.xml"))
    }
    
    htmlReport {
        onCheck.set(true)
        reportDir.set(layout.buildDirectory.dir("reports/kover/html"))
    }
}