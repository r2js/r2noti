module.exports = (app, getConf) => {
  const Plugin = app.service('Plugin');
  const mongoose = app.service('Mongoose');
  const { Validate } = app.service('System');
  const { Schema } = mongoose;
  const { ObjectId, Mixed } = mongoose.Schema.Types;
  const { userModel } = getConf;

  const schema = Schema({
    profile: { type: ObjectId, ref: userModel, index: true },
    title: { type: String, required: true },
    body: { type: String },
    participants: [{ type: ObjectId, ref: userModel }],
    isScheduled: { type: Boolean, default: false },
    scheduleStatus: { type: String, enum: ['waiting', 'finished'] },
    activatedAt: { type: Date },
    badge: { type: Number, default: 0 },
    sound: { type: String },
    data: { type: Mixed },
  }, {
    timestamps: true,
  });

  schema.virtual('hookEnabled').set(function (value) {
    this._hookEnabled = value;
  });

  schema.pre('save', function (next) {
    this.wasNew = this.isNew;
    next();
  });

  schema.post('save', function (noti) {
    if (this.wasNew && this._hookEnabled) {
      app.service('Noti').saveTrigger(noti);
    }
  });

  Plugin.plugins(schema);

  schema.r2options = app.service('model/_options/notification') || {};
  const { attributes, rules } = schema.r2options;
  Validate(schema, { attributes, rules });

  return mongoose.model('notification', schema);
};
