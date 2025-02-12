# Project X Rental Marketplace ProGuard Rules
# Version: 1.0.0

# Keep all annotations, signatures, exceptions, and debugging info for stack traces
-keepattributes *Annotation*, Signature, Exception, EnclosingMethod, InnerClasses
-keepattributes SourceFile, LineNumberTable

# Optimization settings - carefully selected to maintain security-critical code
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*,!code/allocation/variable
-optimizationpasses 5
-dontusemixedcaseclassnames
-verbose

# Security-critical components preservation
-keep class androidx.security.crypto.** { *; }
-keep class androidx.biometric.** { *; }
-keep class javax.crypto.** { *; }
-keep class javax.security.** { *; }
-keep class javax.security.auth.** { *; }

# Retrofit Rules (v2.9.0)
-keepattributes Signature
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn javax.annotation.**
-dontwarn kotlin.Unit
-dontwarn retrofit2.KotlinExtensions
-dontwarn retrofit2.KotlinExtensions$*
-keep class retrofit2.** { *; }

# OkHttp Rules
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Moshi Rules (v1.15.0)
-keep class com.squareup.moshi.** { *; }
-keep interface com.squareup.moshi.** { *; }
-keepclassmembers class ** {
    @com.squareup.moshi.FromJson *;
    @com.squareup.moshi.ToJson *;
}

# Room Database Rules (v2.5.2)
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**
-keep class * extends androidx.room.DatabaseConfiguration
-keepclassmembers class * extends androidx.room.RoomDatabase {
    public static <methods>;
}

# Hilt Rules (v2.47)
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ApplicationComponentManager
-keepclasseswithmembernames class * {
    @dagger.hilt.* <methods>;
}

# Data Models and Entities
-keep class com.projectx.rental.data.models.** { *; }
-keep class com.projectx.rental.data.db.entities.** { *; }
-keepclassmembers class com.projectx.rental.data.** {
    <init>(...);
    <fields>;
}

# Serialization Support
-keepclassmembers class * implements java.io.Serializable {
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Preserve Enum Classes
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Security-Enhanced Native Methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Preserve JavaScript Interface Methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve Parcelable Classes
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Preserve Custom Application Class
-keep public class com.projectx.rental.RentalApplication

# Preserve BuildConfig for Release Variant
-keep class com.projectx.rental.BuildConfig { *; }

# Security Provider Rules
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# Biometric Authentication Rules
-keep class androidx.biometric.BiometricPrompt$** { *; }
-keep class android.security.keystore.** { *; }

# Cryptography Rules
-keep class androidx.security.crypto.EncryptedSharedPreferences { *; }
-keep class androidx.security.crypto.MasterKey { *; }

# Remove Logging in Release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
}

# Keep SafetyNet and Play Integrity API
-keep class com.google.android.play.core.integrity.** { *; }
-keep class com.google.android.gms.safetynet.** { *; }

# Preserve Lambda Expressions
-keep class kotlin.jvm.internal.Lambda { *; }
-keepclassmembernames class kotlin.jvm.internal.Lambda {
    <methods>;
}

# Preserve Coroutines
-keepclassmembernames class kotlinx.coroutines.** {
    volatile <fields>;
}
-keepclassmembers class kotlinx.coroutines.** {
    public static ** INSTANCE;
}

# Preserve View Binding
-keep class * implements androidx.viewbinding.ViewBinding {
    public static ** bind(android.view.View);
    public static ** inflate(...);
}