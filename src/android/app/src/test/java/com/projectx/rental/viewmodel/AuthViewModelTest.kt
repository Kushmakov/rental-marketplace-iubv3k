package com.projectx.rental.viewmodel

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.security.crypto.SecureTokenManager
import androidx.work.NetworkStateManager
import com.projectx.rental.data.api.AuthResponse
import com.projectx.rental.data.db.entities.User
import com.projectx.rental.data.repository.AuthRepository
import com.projectx.rental.data.repository.AuthState
import com.projectx.rental.ui.auth.AuthViewModel
import com.projectx.rental.util.AUTH
import com.projectx.rental.util.BIOMETRIC
import com.projectx.rental.util.SecurityUtils
import io.mockk.*
import io.mockk.impl.annotations.MockK
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.util.*
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@ExperimentalCoroutinesApi
class AuthViewModelTest {

    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    private val testDispatcher = TestCoroutineDispatcher()
    private val testScope = TestCoroutineScope(testDispatcher)

    @MockK
    private lateinit var authRepository: AuthRepository

    @MockK
    private lateinit var networkStateManager: NetworkStateManager

    @MockK
    private lateinit var secureTokenManager: SecureTokenManager

    @MockK
    private lateinit var biometricManager: BiometricManager

    private lateinit var viewModel: AuthViewModel

    private val testUser = User(
        id = UUID.randomUUID(),
        email = "test@example.com",
        firstName = "Test",
        lastName = "User",
        phoneNumber = "+1234567890",
        profileImageUrl = null,
        createdAt = Date(),
        updatedAt = Date()
    )

    @Before
    fun setup() {
        MockKAnnotations.init(this)
        Dispatchers.setMain(testDispatcher)

        // Configure network state
        every { networkStateManager.isNetworkAvailable() } returns true

        // Configure biometric manager
        every { 
            biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) 
        } returns BiometricManager.BIOMETRIC_SUCCESS

        // Configure secure token manager
        every { secureTokenManager.isBiometricEnabled() } returns false
        every { 
            secureTokenManager.storeToken(any(), any(), any()) 
        } just Runs

        viewModel = AuthViewModel(
            authRepository = authRepository,
            networkStateManager = networkStateManager,
            secureTokenManager = secureTokenManager
        )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        testDispatcher.cleanupTestCoroutines()
        clearAllMocks()
        
        // Clear sensitive data
        unmockkAll()
        System.gc()
    }

    @Test
    fun `login success with valid credentials`() = testScope.runTest {
        // Arrange
        val email = "test@example.com"
        val password = "Test@123"
        val authState = AuthState.Authenticated(testUser, false)
        
        coEvery { 
            authRepository.login(email, password, false)
        } returns flowOf(Result.success(authState))

        // Act
        viewModel.login(email, password)
        advanceUntilIdle()

        // Assert
        assertTrue(viewModel.isAuthenticated.value == true)
        assertEquals(testUser, viewModel.currentUser.value)
        assertFalse(viewModel.biometricAvailable.value == true)
        assertNull(viewModel.authError.value)

        coVerify { 
            authRepository.login(email, password, false)
            secureTokenManager.storeToken(AUTH.ACCESS_TOKEN_KEY, any(), any())
        }
    }

    @Test
    fun `login failure with invalid credentials`() = testScope.runTest {
        // Arrange
        val email = "invalid@example.com"
        val password = "invalid"
        
        coEvery { 
            authRepository.login(email, password, false)
        } returns flowOf(Result.failure(IllegalArgumentException("Invalid credentials")))

        // Act
        viewModel.login(email, password)
        advanceUntilIdle()

        // Assert
        assertFalse(viewModel.isAuthenticated.value == true)
        assertNull(viewModel.currentUser.value)
        assertEquals("Invalid email or password", viewModel.authError.value?.message)

        coVerify { 
            authRepository.login(email, password, false)
        }
    }

    @Test
    fun `login with biometric enabled`() = testScope.runTest {
        // Arrange
        val email = "test@example.com"
        val password = "Test@123"
        val authState = AuthState.Authenticated(testUser, true)
        
        coEvery { 
            authRepository.login(email, password, true)
        } returns flowOf(Result.success(authState))

        // Act
        viewModel.login(email, password, enableBiometric = true)
        advanceUntilIdle()

        // Assert
        assertTrue(viewModel.isAuthenticated.value == true)
        assertTrue(viewModel.biometricAvailable.value == true)
        assertEquals(testUser, viewModel.currentUser.value)

        coVerify { 
            authRepository.login(email, password, true)
            secureTokenManager.storeToken(AUTH.ACCESS_TOKEN_KEY, any(), any())
        }
    }

    @Test
    fun `logout success`() = testScope.runTest {
        // Arrange
        coEvery { authRepository.clearAuthState() } just Runs
        coEvery { secureTokenManager.clearTokens() } just Runs

        // Set initial authenticated state
        viewModel.login("test@example.com", "Test@123")
        advanceUntilIdle()

        // Act
        viewModel.logout()
        advanceUntilIdle()

        // Assert
        assertFalse(viewModel.isAuthenticated.value == true)
        assertNull(viewModel.currentUser.value)
        assertFalse(viewModel.biometricAvailable.value == true)

        coVerify { 
            authRepository.clearAuthState()
            secureTokenManager.clearTokens()
        }
    }

    @Test
    fun `token refresh success`() = testScope.runTest {
        // Arrange
        val newToken = "new_token"
        
        coEvery { 
            authRepository.refreshToken()
        } returns flowOf(Result.success(newToken))

        // Act
        viewModel.login("test@example.com", "Test@123")
        advanceTimeBy(45 * 60 * 1000) // Advance 45 minutes
        advanceUntilIdle()

        // Assert
        assertTrue(viewModel.isAuthenticated.value == true)
        
        coVerify { 
            secureTokenManager.storeToken(
                AUTH.ACCESS_TOKEN_KEY,
                newToken,
                any()
            )
        }
    }

    @Test
    fun `token refresh failure triggers logout`() = testScope.runTest {
        // Arrange
        coEvery { 
            authRepository.refreshToken()
        } returns flowOf(Result.failure(Exception("Token refresh failed")))
        
        coEvery { authRepository.clearAuthState() } just Runs
        coEvery { secureTokenManager.clearTokens() } just Runs

        // Act
        viewModel.login("test@example.com", "Test@123")
        advanceTimeBy(45 * 60 * 1000) // Advance 45 minutes
        advanceUntilIdle()

        // Assert
        assertFalse(viewModel.isAuthenticated.value == true)
        assertNull(viewModel.currentUser.value)
        assertEquals("Failed to refresh authentication token", viewModel.authError.value?.message)

        coVerify { 
            authRepository.clearAuthState()
            secureTokenManager.clearTokens()
        }
    }

    @Test
    fun `validate email format`() = testScope.runTest {
        // Arrange
        val invalidEmail = "invalid.email"
        val password = "Test@123"

        // Act
        viewModel.login(invalidEmail, password)
        advanceUntilIdle()

        // Assert
        assertFalse(viewModel.isAuthenticated.value == true)
        assertEquals("Invalid email format", viewModel.authError.value?.message)

        coVerify(exactly = 0) { 
            authRepository.login(any(), any(), any())
        }
    }

    @Test
    fun `validate password requirements`() = testScope.runTest {
        // Arrange
        val email = "test@example.com"
        val invalidPassword = "weak"

        // Act
        viewModel.login(email, invalidPassword)
        advanceUntilIdle()

        // Assert
        assertFalse(viewModel.isAuthenticated.value == true)
        assertEquals("Password does not meet security requirements", viewModel.authError.value?.message)

        coVerify(exactly = 0) { 
            authRepository.login(any(), any(), any())
        }
    }

    @Test
    fun `handle network error during login`() = testScope.runTest {
        // Arrange
        every { networkStateManager.isNetworkAvailable() } returns false

        // Act
        viewModel.login("test@example.com", "Test@123")
        advanceUntilIdle()

        // Assert
        assertFalse(viewModel.isAuthenticated.value == true)
        assertEquals("No network connection available", viewModel.authError.value?.message)

        coVerify(exactly = 0) { 
            authRepository.login(any(), any(), any())
        }
    }
}