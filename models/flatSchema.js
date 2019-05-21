const mongoose = require('mongoose');
const Schema = mongoose.Schema;


var flatSchema = new Schema({
    createdBy: { type: Schema.Types.ObjectId, ref: 'employees' },
    buildingID: { type: Schema.Types.ObjectId, ref: 'buildings' },


}, { strict: false })

module.exports = mongoose.model("flats", flatSchema);