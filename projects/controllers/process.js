var Process = require("../models/process");

module.exports.getAll = async () => {
  return await Process.find().sort({ _id: 1 }).exec();
};

module.exports.getProject = async (user_id, project_id) => {
  return await Process.find({ user_id: user_id, project_id: project_id })
    .sort({ _id: 1 })
    .exec();
};

module.exports.getOneById = async (user_id, project_id, process_id) => {
  return await Process.findOne({
    user_id: user_id,
    project_id: project_id,
    _id: process_id,
  }).exec();
};

module.exports.getOneByMsgId = async (msg_id) => {
  return await Process.findOne({ msg_id: msg_id }).exec();
};

// Backwards-compatible alias: current orchestration uses msg_id lookups.
module.exports.getOne = module.exports.getOneByMsgId;

module.exports.create = async (process) => {
  return await Process.create(process);
};

module.exports.update = (user_id, project_id, process_id, process) => {
  return Process.updateOne(
    { user_id: user_id, project_id: project_id, _id: process_id },
    process,
  );
};

module.exports.delete = (user_id, project_id, process_id) => {
  return Process.deleteOne({
    user_id: user_id,
    project_id: project_id,
    _id: process_id,
  });
};

// Delete all process entries for a project whose msg_id starts with the given prefix.
// Used to implement best-effort cancellation.
module.exports.deleteProjectByMsgPrefix = async (user_id, project_id, prefix) => {
  const re = new RegExp(`^${prefix}`);
  return await Process.deleteMany({
    user_id: user_id,
    project_id: project_id,
    msg_id: re,
  });
};

// Delete preview processes for a specific image.
module.exports.deletePreviewForImage = async (user_id, project_id, img_id) => {
  return await Process.deleteMany({
    user_id: user_id,
    project_id: project_id,
    img_id: img_id,
    msg_id: /^preview-/,
  });
};

// Delete processing (non-preview) processes for a specific image within a project.
module.exports.deleteProcessingForImage = async (user_id, project_id, img_id) => {
  return await Process.deleteMany({
    user_id: user_id,
    project_id: project_id,
    img_id: img_id,
    msg_id: /^request-/,
  });
};

module.exports.getMsgIdsByProjectAndPrefix = async (user_id, project_id, prefix) => {
  const re = new RegExp(`^${prefix}`);
  const docs = await Process.find({
    user_id: user_id,
    project_id: project_id,
    msg_id: re,
  })
    .select({ msg_id: 1 })
    .exec();

  return (docs || []).map((d) => d.msg_id).filter(Boolean);
};

module.exports.getMsgIdsForPreviewImage = async (user_id, project_id, img_id) => {
  const docs = await Process.find({
    user_id: user_id,
    project_id: project_id,
    img_id: img_id,
    msg_id: /^preview-/,
  })
    .select({ msg_id: 1 })
    .exec();

  return (docs || []).map((d) => d.msg_id).filter(Boolean);
};

module.exports.getMsgIdsForProcessingImage = async (user_id, project_id, img_id) => {
  const docs = await Process.find({
    user_id: user_id,
    project_id: project_id,
    img_id: img_id,
    msg_id: /^request-/,
  })
    .select({ msg_id: 1 })
    .exec();

  return (docs || []).map((d) => d.msg_id).filter(Boolean);
};
