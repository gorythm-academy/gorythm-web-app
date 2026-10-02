const mongoose = require('mongoose');

const invoiceSequenceSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('InvoiceSequence', invoiceSequenceSchema);
