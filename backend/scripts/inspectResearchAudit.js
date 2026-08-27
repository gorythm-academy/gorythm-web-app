require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const col = mongoose.connection.db.collection('auditlogs');
    const sample = await col.findOne({});
    console.log('Sample audit keys:', sample ? Object.keys(sample) : 'none');

    const recent = await col.find({}).sort({ createdAt: -1 }).limit(30).toArray();
    const researchish = recent.filter((l) => JSON.stringify(l).toLowerCase().includes('research'));
    console.log('Recent research-related audit entries:', researchish.length);
    researchish.forEach((l) => console.log(JSON.stringify(l, null, 0).slice(0, 500)));

    await mongoose.disconnect();
}

main().catch(console.error);
