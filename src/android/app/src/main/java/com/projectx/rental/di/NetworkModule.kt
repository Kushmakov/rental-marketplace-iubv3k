package com.projectx.rental.di

import com.projectx.rental.data.api.ApiService
import com.projectx.rental.util.API
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.squareup.moshi.adapters.Rfc3339DateJsonAdapter
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.CertificatePinner
import okhttp3.ConnectionPool
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.adapter.rxjava3.RxJava3CallAdapterFactory
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.Date
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import javax.net.ssl.SSLContext
import javax.net.ssl.TLSSocketFactory
import java.security.SecureRandom

/**
 * Dagger Hilt module providing network-related dependencies with enhanced security and monitoring.
 * Implements enterprise-grade networking with certificate pinning, TLS 1.3, and comprehensive logging.
 *
 * @version retrofit2:2.9.0
 * @version okhttp3:4.9.3
 * @version moshi:1.14.0
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    /**
     * Provides secure OkHttpClient instance with enterprise-grade security features.
     */
    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        // Configure certificate pinning
        val certificatePinner = CertificatePinner.Builder()
            .add("api.projectx.com", 
                "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=") // Replace with actual pins
            .add("*.projectx.com", 
                "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=") // Replace with actual pins
            .build()

        // Configure TLS 1.3
        val sslContext = SSLContext.getInstance("TLSv1.3").apply {
            init(null, null, SecureRandom())
        }

        return OkHttpClient.Builder()
            .certificatePinner(certificatePinner)
            .sslSocketFactory(
                sslContext.socketFactory as TLSSocketFactory,
                TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {
                    init(null as KeyStore?)
                }.trustManagers[0] as X509TrustManager
            )
            .connectionPool(ConnectionPool(5, 30, TimeUnit.SECONDS))
            .connectTimeout(API.CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(API.READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(API.WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor(loggingInterceptor)
            .addInterceptor(provideCacheInterceptor())
            .addInterceptor(provideAuthInterceptor())
            .addInterceptor(provideMonitoringInterceptor())
            .cache(provideCache())
            .build()
    }

    /**
     * Provides Moshi instance with custom type adapters for JSON serialization.
     */
    @Provides
    @Singleton
    fun provideMoshi(): Moshi {
        return Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .add(Date::class.java, Rfc3339DateJsonAdapter().nullSafe())
            .add(UUIDAdapter())
            .add(PropertyTypeAdapter())
            .add(PropertyStatusAdapter())
            .build()
    }

    /**
     * Provides Retrofit instance configured with RxJava and Moshi converters.
     */
    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient, moshi: Moshi): Retrofit {
        return Retrofit.Builder()
            .baseUrl(API.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .addCallAdapterFactory(RxJava3CallAdapterFactory.create())
            .build()
    }

    /**
     * Provides ApiService implementation with performance monitoring.
     */
    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): ApiService {
        return retrofit.create(ApiService::class.java)
    }

    private fun provideCacheInterceptor() = Interceptor { chain ->
        val request = chain.request()
        val response = chain.proceed(request)

        // Cache control headers for network performance
        response.newBuilder()
            .header("Cache-Control", "public, max-age=60") // 1 minute cache
            .removeHeader("Pragma")
            .build()
    }

    private fun provideAuthInterceptor() = Interceptor { chain ->
        val request = chain.request()
        
        // Add authentication headers if available
        val authenticatedRequest = TokenManager.getAccessToken()?.let { token ->
            request.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } ?: request

        chain.proceed(authenticatedRequest)
    }

    private fun provideMonitoringInterceptor() = Interceptor { chain ->
        val request = chain.request()
        val startTime = System.nanoTime()

        val response = chain.proceed(request)
        val duration = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startTime)

        // Log performance metrics
        PerformanceMonitor.logNetworkCall(
            url = request.url.toString(),
            method = request.method,
            duration = duration,
            statusCode = response.code,
            requestSize = request.body?.contentLength() ?: 0,
            responseSize = response.body?.contentLength() ?: 0
        )

        response
    }

    private fun provideCache(): Cache {
        val cacheSize = 10 * 1024 * 1024L // 10 MB cache
        return Cache(File(context.cacheDir, "http_cache"), cacheSize)
    }

    /**
     * Custom JSON adapter for UUID serialization
     */
    private class UUIDAdapter {
        @ToJson
        fun toJson(uuid: UUID) = uuid.toString()

        @FromJson
        fun fromJson(string: String) = UUID.fromString(string)
    }
}