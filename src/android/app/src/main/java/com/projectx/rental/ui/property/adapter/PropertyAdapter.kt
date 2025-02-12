package com.projectx.rental.ui.property.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions
import com.google.android.material.card.MaterialCardView
import com.projectx.rental.R
import com.projectx.rental.data.db.entities.Property
import com.projectx.rental.databinding.ItemPropertyBinding
import java.text.NumberFormat
import java.util.Locale

/**
 * RecyclerView adapter for displaying property listings with Material Design 3.0 styling.
 * Supports both grid and list layouts with efficient list updates via DiffUtil.
 *
 * @property onPropertyClick Callback for property item clicks
 * @property onFavoriteClick Callback for favorite button clicks
 * @property isGridLayout Flag to determine layout type (grid/list)
 */
class PropertyAdapter(
    private val onPropertyClick: (Property) -> Unit,
    private val onFavoriteClick: (Property) -> Unit,
    private var isGridLayout: Boolean = true
) : ListAdapter<Property, PropertyAdapter.PropertyViewHolder>(PropertyDiffCallback()) {

    private val currencyFormatter = NumberFormat.getCurrencyInstance(Locale.US)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PropertyViewHolder {
        val binding = ItemPropertyBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )

        // Configure layout parameters based on grid/list mode
        binding.root.layoutParams = ViewGroup.LayoutParams(
            if (isGridLayout) {
                ViewGroup.LayoutParams.MATCH_PARENT
            } else {
                ViewGroup.LayoutParams.MATCH_PARENT
            },
            ViewGroup.LayoutParams.WRAP_CONTENT
        )

        return PropertyViewHolder(binding)
    }

    override fun onBindViewHolder(holder: PropertyViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    /**
     * Updates the layout mode between grid and list views
     */
    fun setLayoutMode(gridLayout: Boolean) {
        if (isGridLayout != gridLayout) {
            isGridLayout = gridLayout
            notifyItemRangeChanged(0, itemCount)
        }
    }

    inner class PropertyViewHolder(
        private val binding: ItemPropertyBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(property: Property) {
            with(binding) {
                // Configure card for Material Design touch feedback
                propertyCard.apply {
                    strokeWidth = 0
                    setOnClickListener { onPropertyClick(property) }
                }

                // Set property details with proper formatting
                propertyName.text = property.name
                propertyPrice.text = "${currencyFormatter.format(property.price)}/month"
                propertyDetails.text = itemView.context.getString(
                    R.string.property_details_format,
                    property.bedrooms,
                    property.bathrooms
                )

                // Configure favorite button with proper state and accessibility
                favoriteButton.apply {
                    setIconResource(
                        if (property.isFavorite) R.drawable.ic_favorite_filled
                        else R.drawable.ic_favorite_outline
                    )
                    contentDescription = itemView.context.getString(
                        if (property.isFavorite) R.string.action_remove_favorite
                        else R.string.action_add_favorite
                    )
                    setOnClickListener { onFavoriteClick(property) }
                }

                // Load property image with Glide
                property.images.firstOrNull()?.let { image ->
                    Glide.with(propertyImage)
                        .load(image.url)
                        .transition(DrawableTransitionOptions.withCrossFade())
                        .placeholder(R.drawable.placeholder_property)
                        .error(R.drawable.error_property)
                        .into(propertyImage)

                    propertyImage.contentDescription = itemView.context.getString(
                        R.string.property_image_description,
                        property.name
                    )
                }

                // Set accessibility labels
                propertyName.contentDescription = property.name
                propertyPrice.contentDescription = itemView.context.getString(
                    R.string.price_description,
                    currencyFormatter.format(property.price)
                )
                propertyDetails.contentDescription = itemView.context.getString(
                    R.string.property_details_description,
                    property.bedrooms,
                    property.bathrooms
                )
            }
        }
    }
}

/**
 * DiffUtil callback for efficient list updates
 */
private class PropertyDiffCallback : DiffUtil.ItemCallback<Property>() {
    override fun areItemsTheSame(oldItem: Property, newItem: Property): Boolean {
        return oldItem.id == newItem.id
    }

    override fun areContentsTheSame(oldItem: Property, newItem: Property): Boolean {
        return oldItem == newItem
    }
}