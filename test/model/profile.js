module.exports = (app) => {
  const Plugin = app.service('Plugin');
  const mongoose = app.service('Mongoose');
  const { Schema } = mongoose;

  const schema = Schema({
    name: { type: String, required: true },
    device: { type: String, enum: ['ios', 'android'] },
    deviceToken: { type: String },
  }, {
    timestamps: true,
  });

  schema.set('toJSON', { virtuals: true });
  schema.set('toObject', { virtuals: true });

  Plugin.plugins(schema);
  const { Users } = app.service('System');
  return Users.discriminator('profile', schema);
};
