plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

import java.util.Properties

val keystoreProps = Properties().apply {
    val propsFile = rootProject.file("local.properties")
    if (propsFile.exists()) {
        propsFile.inputStream().use { load(it) }
    }
}

android {
    namespace = "com.automation.companion"
    compileSdk = 35

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.automation.companion"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"${keystoreProps.getProperty("firebase.projectId") ?: ""}\"")
        buildConfigField("String", "FIREBASE_APP_ID", "\"${keystoreProps.getProperty("firebase.appId") ?: ""}\"")
        buildConfigField("String", "FIREBASE_API_KEY", "\"${keystoreProps.getProperty("firebase.apiKey") ?: ""}\"")
        buildConfigField("String", "FIREBASE_GCM_SENDER_ID", "\"${keystoreProps.getProperty("firebase.gcmSenderId") ?: ""}\"")
    }

    signingConfigs {
        create("release") {
            val path = keystoreProps.getProperty("signing.keystore.path") ?: return@create
            storeFile = file(path)
            storePassword = keystoreProps.getProperty("signing.keystore.storePassword") ?: return@create
            keyAlias = keystoreProps.getProperty("signing.keystore.alias") ?: return@create
            keyPassword = keystoreProps.getProperty("signing.keystore.keyPassword") ?: return@create
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.firebase.messaging)
    implementation(libs.zxing.android.embedded)
}
