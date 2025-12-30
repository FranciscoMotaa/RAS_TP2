var Process = require("../models/process");

module.exports.getAll = async () => {
  return await Process.find().sort({ _id: 1 }).exec();
};

module.exports.getProject = async (user_id, project_id) => {
  return await Process.find({ user_id: user_id, project_id: project_id })
    .sort({ _id: 1 })
    .exec();
};

module.exports.getOne = async (user_id, project_id, process_id) => {
  return await Process.findOne({
    user_id: user_id,
    project_id: project_id,
    _id: process_id,
  }).exec();
};

module.exports.getOneByMsgId = async (msg_id) => {
  return await Process.findOne({ msg_id: msg_id }).exec();
};

module.exports.create = async (process) => {
  return await Process.create(process);
};

module.exports.update = (user_id, project_id, process_id, process) => {
  return Process.updateOne(
    { user_id: user_id, project_id: project_id, _id: process_id },
    process
  );
};

module.exports.delete = (user_id, project_id, process_id) => {
  return Process.deleteOne({
    user_id: user_id,
    project_id: project_id,
    _id: process_id,
  });
};

// NOVA FUNÇÃO ADICIONADA
module.exports.cancelProject = async (req, res) => {
  const projectId = req.params.id;
  const userId = req.body.user_id;

  try {
    const activeProcesses = await Process.find({
      project_id: projectId,
      user_id: userId,
      status: "processing",
    });

    if (activeProcesses.length === 0) {
      return res.status(404).json({ message: "No active processes found" });
    }

    await Process.updateMany(
      { project_id: projectId, user_id: userId, status: "processing" },
      { status: "cancelled" }
    );

    res.json({ message: "Project processing cancelled successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error cancelling project", error: err });
  }
};
