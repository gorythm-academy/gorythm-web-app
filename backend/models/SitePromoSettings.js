const mongoose = require('mongoose');

const sitePromoSettingsSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, default: 'site-promo' },
        homepageVideoId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PromoVideo',
            default: null,
        },
        aboutVideoId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PromoVideo',
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('SitePromoSettings', sitePromoSettingsSchema);
