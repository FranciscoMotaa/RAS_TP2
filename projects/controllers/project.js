var Project = require("../models/project");

module.exports.getAll = async (user_id) => {
  return await Project.find({ user_id: user_id }).sort({ _id: 1 }).exec();
};

module.exports.getOne = async (user_id, project_id) => {
  return await Project.findOne({ user_id: user_id, _id: project_id }).exec();
};

module.exports.create = async (project) => {
  return await Project.create(project);
};

module.exports.update = (user_id, project_id, project) => {
  return Project.updateOne({ user_id: user_id, _id: project_id }, project);
};

// Atomically append an image to the imgs array while preventing
// duplicates by og_uri (derived from the original filename).
module.exports.appendImage = (user_id, project_id, img) => {
  return Project.updateOne(
    {
      user_id: user_id,
      _id: project_id,
      "imgs.og_uri": { $ne: img.og_uri },
    },
    {
      $push: { imgs: img },
    },
  );
};

module.exports.delete = (user_id, project_id) => {
  return Project.deleteOne({ user_id: user_id, _id: project_id });
};
