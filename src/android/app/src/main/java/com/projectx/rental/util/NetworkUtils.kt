package com.projectx.rental.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkInfo
import androidx.annotation.RequiresPermission

/**
 * Utility class providing comprehensive network connectivity functionality for the rental application.
 * Includes caching mechanism for efficient network status checking and detailed connection information.
 *
 * @version 1.0
 */
object NetworkUtils {

    // Cache duration for network checks (5 seconds)
    private const val NETWORK_CHECK_CACHE_DURATION = 5000L

    // Threshold for high-speed connection in Mbps
    private const val HIGH_SPEED_THRESHOLD_MBPS = 10

    // Cache variables for network status
    private var lastNetworkCheckTime: Long = 0
    private var cachedNetworkAvailability: Boolean? = null

    /**
     * Checks if network connectivity is available with efficient caching mechanism.
     * 
     * @param context Application context
     * @return Boolean indicating if network is available
     * @throws SecurityException if ACCESS_NETWORK_STATE permission is not granted
     */
    @RequiresPermission(android.Manifest.permission.ACCESS_NETWORK_STATE)
    fun isNetworkAvailable(context: Context): Boolean {
        // Check cache validity
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastNetworkCheckTime < NETWORK_CHECK_CACHE_DURATION) {
            cachedNetworkAvailability?.let {
                return it
            }
        }

        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false.also {
                updateNetworkCache(it, currentTime)
            }

        // Check network availability using modern API (Android M and above)
        val networkAvailable = connectivityManager.activeNetwork?.let { network ->
            connectivityManager.getNetworkCapabilities(network)?.let { capabilities ->
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            }
        } ?: false

        return networkAvailable.also {
            updateNetworkCache(it, currentTime)
        }
    }

    /**
     * Gets detailed information about the current network connection type.
     * 
     * @param context Application context
     * @return String describing the network type (WIFI, CELLULAR, ETHERNET, VPN, NONE)
     * @throws SecurityException if ACCESS_NETWORK_STATE permission is not granted
     */
    @RequiresPermission(android.Manifest.permission.ACCESS_NETWORK_STATE)
    fun getNetworkType(context: Context): String {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return "NONE"

        val activeNetwork = connectivityManager.activeNetwork ?: return "NONE"
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return "NONE"

        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "VPN"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                // Determine cellular generation
                when {
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) -> "5G"
                    capabilities.linkDownstreamBandwidthKbps >= 14000 -> "4G"
                    else -> "3G"
                }
            }
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
            else -> "UNKNOWN"
        }
    }

    /**
     * Checks if the current network connection is high-speed and stable.
     * 
     * @param context Application context
     * @return Boolean indicating if connection is high-speed
     * @throws SecurityException if ACCESS_NETWORK_STATE permission is not granted
     */
    @RequiresPermission(android.Manifest.permission.ACCESS_NETWORK_STATE)
    fun isHighSpeedConnection(context: Context): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false

        val activeNetwork = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false

        // Check connection speed and stability
        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> {
                capabilities.linkDownstreamBandwidthKbps >= (HIGH_SPEED_THRESHOLD_MBPS * 1000)
            }
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                // More conservative threshold for cellular to account for variability
                capabilities.linkDownstreamBandwidthKbps >= (HIGH_SPEED_THRESHOLD_MBPS * 500) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_CONGESTED)
            }
            else -> false
        }
    }

    /**
     * Updates the network availability cache with current status and timestamp.
     * 
     * @param availability Current network availability status
     * @param timestamp Current timestamp
     */
    private fun updateNetworkCache(availability: Boolean, timestamp: Long) {
        cachedNetworkAvailability = availability
        lastNetworkCheckTime = timestamp
    }
}