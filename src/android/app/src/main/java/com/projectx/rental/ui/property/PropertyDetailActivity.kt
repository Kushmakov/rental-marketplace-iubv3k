package com.projectx.rental.ui.property

import android.os.Bundle
import android.view.View
import android.view.accessibility.AccessibilityEvent
import androidx.activity.viewModels
import androidx.viewpager2.widget.ViewPager2
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.google.android.material.snackbar.Snackbar
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.logEvent
import com.projectx.rental.R
import com.projectx.rental.ui.common.BaseActivity
import com.projectx.rental.data.db.entities.Property
import com.projectx.rental.ui.adapters.PropertyImageAdapter
import com.projectx.rental.util.NetworkUtils
import dagger.hilt.android.AndroidEntryPoint
import java.util.UUID
import javax.inject.Inject

/**
 * Activity displaying detailed property information with Material Design 3.0 components.
 * Implements offline-first architecture with background synchronization.
 *
 * @version 1.0
 */
@AndroidEntryPoint
class PropertyDetailActivity : BaseActivity() {

    private val viewModel: PropertyDetailViewModel by viewModels()
    
    private lateinit var imageViewPager: ViewPager2
    private lateinit var toolbar: MaterialToolbar
    private lateinit var applyButton: FloatingActionButton
    private lateinit var propertyId: UUID
    
    @Inject
    lateinit var analytics: FirebaseAnalytics
    
    private val imageAdapter = PropertyImageAdapter()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_property_detail)

        // Extract property ID from intent
        propertyId = intent.getSerializableExtra(EXTRA_PROPERTY_ID) as UUID

        initializeViews()
        setupUI()
        observeViewModel()
        setupAnalytics()

        // Load property data with offline support
        loadPropertyData(savedInstanceState)
    }

    private fun initializeViews() {
        toolbar = findViewById(R.id.toolbar)
        imageViewPager = findViewById(R.id.image_viewpager)
        applyButton = findViewById(R.id.apply_button)

        // Configure ViewPager2 for image gallery
        imageViewPager.apply {
            adapter = imageAdapter
            offscreenPageLimit = 2
            setPageTransformer(createPageTransformer())
        }
    }

    private fun setupUI() {
        setupToolbar()
        setupImageGallery()
        setupApplyButton()
        setupAccessibility()
    }

    private fun setupToolbar() {
        toolbar.apply {
            setNavigationOnClickListener { onBackPressed() }
            setOnMenuItemClickListener { menuItem ->
                when (menuItem.itemId) {
                    R.id.action_favorite -> {
                        viewModel.toggleFavorite()
                        true
                    }
                    R.id.action_share -> {
                        shareProperty()
                        true
                    }
                    else -> false
                }
            }
        }
    }

    private fun setupImageGallery() {
        imageViewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                super.onPageSelected(position)
                analytics.logEvent(FirebaseAnalytics.Event.VIEW_ITEM) {
                    param("image_position", position.toString())
                }
            }
        })
    }

    private fun setupApplyButton() {
        applyButton.apply {
            setOnClickListener {
                analytics.logEvent("start_application") {
                    param("property_id", propertyId.toString())
                }
                startApplication()
            }
            contentDescription = getString(R.string.apply_button_description)
        }
    }

    private fun setupAccessibility() {
        imageViewPager.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        toolbar.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    private fun observeViewModel() {
        viewModel.property.observe(this) { property ->
            property?.let {
                updatePropertyDetails(it)
            }
        }

        viewModel.images.observe(this) { images ->
            imageAdapter.submitList(images)
        }

        viewModel.networkState.observe(this) { state ->
            when (state) {
                is NetworkState.OFFLINE -> showOfflineMode()
                is NetworkState.ERROR -> handleNetworkError()
                is NetworkState.CONNECTED -> hideOfflineMode()
            }
        }

        viewModel.errorState.observe(this) { error ->
            error?.let { showError(ErrorType.GENERAL, it.message) }
        }
    }

    private fun loadPropertyData(savedInstanceState: Bundle?) {
        savedInstanceState?.let {
            // Restore saved state if available
            propertyId = it.getSerializable(KEY_PROPERTY_ID) as UUID
        }

        viewModel.loadProperty(propertyId)
    }

    private fun updatePropertyDetails(property: Property) {
        toolbar.title = property.name
        
        // Update UI components with property details
        findViewById<View>(R.id.property_price).apply {
            contentDescription = getString(R.string.price_description, property.price)
            // Set price text
        }

        // Update amenities
        property.amenities.forEach { amenity ->
            // Add amenity views
        }

        // Update availability status
        updateAvailabilityStatus(property.isAvailable)
    }

    private fun updateAvailabilityStatus(isAvailable: Boolean) {
        applyButton.isEnabled = isAvailable
        if (!isAvailable) {
            Snackbar.make(
                findViewById(android.R.id.content),
                R.string.property_not_available,
                Snackbar.LENGTH_LONG
            ).show()
        }
    }

    private fun showOfflineMode() {
        Snackbar.make(
            findViewById(android.R.id.content),
            R.string.offline_mode_message,
            Snackbar.LENGTH_INDEFINITE
        ).setAction(R.string.retry) {
            viewModel.refreshProperty()
        }.show()
    }

    private fun startApplication() {
        // Start application flow
    }

    private fun shareProperty() {
        // Implement share functionality
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putSerializable(KEY_PROPERTY_ID, propertyId)
    }

    private fun setupAnalytics() {
        analytics.logEvent(FirebaseAnalytics.Event.SCREEN_VIEW) {
            param(FirebaseAnalytics.Param.SCREEN_NAME, "PropertyDetail")
            param(FirebaseAnalytics.Param.ITEM_ID, propertyId.toString())
        }
    }

    companion object {
        private const val EXTRA_PROPERTY_ID = "extra_property_id"
        private const val KEY_PROPERTY_ID = "key_property_id"
    }
}