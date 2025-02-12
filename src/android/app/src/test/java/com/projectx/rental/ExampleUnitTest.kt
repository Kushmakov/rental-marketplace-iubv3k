package com.projectx.rental

import org.junit.jupiter.api.Test // v5.9.3
import org.junit.jupiter.api.Assertions.* // v5.9.3

/**
 * Example unit test class demonstrating basic JUnit 5 test setup and assertion patterns.
 * Serves as a template for implementing unit tests in the Project X rental application.
 *
 * This class showcases:
 * - Proper test method structure
 * - Basic assertion usage
 * - JUnit 5 annotations
 * - Clear test naming and documentation
 */
class ExampleUnitTest {

    /**
     * Example test method demonstrating basic arithmetic assertion using JUnit 5.
     * Shows proper test method structure and assertion usage pattern.
     *
     * Test steps:
     * 1. Define expected result value
     * 2. Perform basic arithmetic operation
     * 3. Assert actual result matches expected value
     */
    @Test
    fun addition_isCorrect() {
        // Given: Expected result value
        val expected = 4

        // When: Performing arithmetic operation
        val actual = 2 + 2

        // Then: Verify result matches expectation
        assertEquals(expected, actual, "Basic arithmetic addition should work correctly")
    }
}