package com.projectx.rental.data.api

import android.content.Context
import com.projectx.rental.data.api.ApiService
import com.projectx.rental.util.NetworkUtils
import com.projectx.rental.util.Constants.API
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.Cache
import okhttp3.CertificatePinner
import okhttp3.ConnectionSpec
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.adapter.rxjava3.RxJava3CallAdapterFactory
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TLSSocketFactory
import java.security.SecureRandom

/**
 * Singleton class responsible for creating and managing the Retrofit HTTP client
 * with comprehensive security features and performance optimizations.
 *
 * @version retrofit2:2.9.0
 * @version okhttp3:4.9.3
 * @version moshi:1.14.0
 */
class ApiClient private constructor(private val context: Context) {

    private val cacheSize = 10 * 1024 * 1024L // 10 MB cache
    private var apiService: ApiService? = null

    private val certificatePinner = CertificatePinner.Builder()
        .add("api.projectx.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=") // Replace with actual certificate hash
        .add("*.projectx.com", "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=") // Replace with actual certificate hash
        .build()

    private val cache = Cache(context.cacheDir, cacheSize)

    private val authInterceptor = Interceptor { chain ->
        // TODO: Implement token management
        val originalRequest = chain.request()
        chain.proceed(originalRequest)
    }

    private val networkInterceptor = Interceptor { chain ->
        var request = chain.request()
        
        if (!NetworkUtils.isNetworkAvailable(context)) {
            request = request.newBuilder()
                .header("Cache-Control", "public, only-if-cached, max-stale=${60 * 60 * 24}")
                .build()
        }
        
        chain.proceed(request)
    }

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.BODY
        } else {
            HttpLoggingInterceptor.Level.NONE
        }
    }

    private val connectionSpec = ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
        .tlsVersions(TlsVersion.TLS_1_3)
        .cipherSuites(
            CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
            CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
            CipherSuite.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,
            CipherSuite.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
        )
        .build()

    private val okHttpClient = OkHttpClient.Builder().apply {
        connectTimeout(API.CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        readTimeout(API.READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        writeTimeout(API.WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        retryOnConnectionFailure(true)
        followRedirects(false)
        connectionSpecs(listOf(connectionSpec))
        certificatePinner(certificatePinner)
        cache(cache)
        addInterceptor(authInterceptor)
        addInterceptor(networkInterceptor)
        addInterceptor(loggingInterceptor)
    }.build()

    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private val retrofit = Retrofit.Builder()
        .baseUrl(API.BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .addCallAdapterFactory(RxJava3CallAdapterFactory.create())
        .build()

    /**
     * Returns singleton instance of ApiService with thread-safety and error handling
     */
    @Synchronized
    fun getApiService(): ApiService {
        return apiService ?: retrofit.create(ApiService::class.java).also {
            apiService = it
        }
    }

    companion object {
        @Volatile
        private var instance: ApiClient? = null

        /**
         * Returns singleton instance of ApiClient with double-checked locking
         */
        fun getInstance(context: Context): ApiClient {
            return instance ?: synchronized(this) {
                instance ?: ApiClient(context.applicationContext).also {
                    instance = it
                }
            }
        }
    }
}