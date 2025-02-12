package com.projectx.rental.data.api

import com.projectx.rental.data.db.entities.Property
import com.projectx.rental.data.db.entities.User
import io.reactivex.rxjava3.core.Single
import retrofit2.Response
import retrofit2.http.*
import java.util.UUID

/**
 * Retrofit service interface defining all API endpoints for the rental application.
 * Implements type-safe HTTP client methods with comprehensive error handling and RxJava integration.
 *
 * @version retrofit2:2.9.0
 * @version io.reactivex.rxjava3:rxjava3:3.1.5
 * @version okhttp3:4.9.0
 */
interface ApiService {

    /**
     * Authenticates user and returns JWT token with refresh token
     */
    @POST("auth/login")
    @Headers("Content-Type: application/json")
    fun login(
        @Body loginRequest: LoginRequest
    ): Single<Response<AuthResponse>>

    /**
     * Registers new user account with validation
     */
    @POST("auth/signup")
    @Headers("Content-Type: application/json")
    fun signup(
        @Body signupRequest: SignupRequest
    ): Single<Response<AuthResponse>>

    /**
     * Refreshes expired access token using refresh token
     */
    @POST("auth/refresh")
    @Headers("Content-Type: application/json")
    fun refreshToken(
        @Body refreshRequest: RefreshTokenRequest
    ): Single<Response<AuthResponse>>

    /**
     * Retrieves paginated and filtered list of properties
     */
    @GET("properties")
    fun getProperties(
        @Query("page") page: Int,
        @Query("limit") limit: Int,
        @Query("filter") filter: Map<String, Any>? = null,
        @Query("sort") sort: String? = null,
        @Query("location") location: String? = null
    ): Single<Response<PagedResponse<Property>>>

    /**
     * Retrieves detailed property information by ID
     */
    @GET("properties/{id}")
    fun getPropertyById(
        @Path("id") propertyId: UUID
    ): Single<Response<Property>>

    /**
     * Creates new property listing
     */
    @POST("properties")
    @Headers("Content-Type: application/json")
    fun createProperty(
        @Body property: Property
    ): Single<Response<Property>>

    /**
     * Updates existing property information
     */
    @PUT("properties/{id}")
    @Headers("Content-Type: application/json")
    fun updateProperty(
        @Path("id") propertyId: UUID,
        @Body property: Property
    ): Single<Response<Property>>

    /**
     * Retrieves user profile information
     */
    @GET("users/me")
    fun getCurrentUser(): Single<Response<User>>

    /**
     * Updates user profile information
     */
    @PUT("users/me")
    @Headers("Content-Type: application/json")
    fun updateProfile(
        @Body user: User
    ): Single<Response<User>>

    /**
     * Submits rental application for a property
     */
    @POST("applications")
    @Headers("Content-Type: application/json")
    fun submitApplication(
        @Body application: RentalApplication
    ): Single<Response<ApplicationResponse>>

    /**
     * Retrieves application status and details
     */
    @GET("applications/{id}")
    fun getApplicationStatus(
        @Path("id") applicationId: UUID
    ): Single<Response<ApplicationResponse>>

    /**
     * Uploads property or document images
     */
    @Multipart
    @POST("uploads")
    fun uploadFile(
        @Part file: okhttp3.MultipartBody.Part,
        @Part("type") type: String
    ): Single<Response<UploadResponse>>
}

/**
 * Data classes for request/response objects
 */
data class LoginRequest(
    val email: String,
    val password: String
)

data class SignupRequest(
    val email: String,
    val password: String,
    val firstName: String,
    val lastName: String,
    val phoneNumber: String
)

data class RefreshTokenRequest(
    val refreshToken: String
)

data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val user: User
)

data class PagedResponse<T>(
    val items: List<T>,
    val total: Int,
    val page: Int,
    val limit: Int,
    val hasMore: Boolean
)

data class RentalApplication(
    val propertyId: UUID,
    val userId: UUID,
    val documents: List<String>,
    val creditCheck: Boolean,
    val backgroundCheck: Boolean,
    val employmentVerification: Boolean
)

data class ApplicationResponse(
    val id: UUID,
    val status: ApplicationStatus,
    val propertyId: UUID,
    val userId: UUID,
    val createdAt: String,
    val updatedAt: String
)

data class UploadResponse(
    val url: String,
    val fileType: String,
    val fileName: String
)

enum class ApplicationStatus {
    PENDING,
    REVIEWING,
    APPROVED,
    REJECTED
}