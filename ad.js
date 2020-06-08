const cloud = require("wx-server-sdk");
const moment = require("moment");

const COLLECTION_A = "a";

const AD_MAX_PLAY_FOR_DAY = 18; // 每日广告最大调用次数上限.
const AD_CD = 9; // 每隔多少个广告调用,就cd
const AD_DELAY_TIME = 2 * 60 * 60 * 1000; // 广告播放等待时间
const AD_MIN_INVOKE_INTERVAL = 8 * 1000; // 广告播放最小调用间隔
const AD_CONFIG = {
  video: "adunit-66c8bc564045ebcf"
};

const getAllByQuery = async query => {
  let { total } = await query.count();
  let list = [];
  while (list.length < total) {
    let ds = await query
      .skip(list.length)
      .limit(100)
      .get();
    list = [...list, ...ds.data];
  }
  return list;
};

exports.ad = {
  time: moment().format("yyyy-MM-DD"),
  get collection() {
    return cloud.database().collection(COLLECTION_A);
  },
  async logs(params = {}) {
    return await getAllByQuery(this.collection.where({ day: moment().format("yyyy-MM-DD"), ...params }));
  },
  async check(openid) {
    if (!AD_CONFIG.video) throw { errCode: 1007, errMsg: "功能未开放" };
    let logs = await this.logs({ openid });
    if (logs.length >= AD_MAX_PLAY_FOR_DAY) throw { errCode: 1005, errMsg: "今日播放次数已耗尽" };
    if (logs.length && moment().diff(logs[logs.length - 1].time) <= AD_MIN_INVOKE_INTERVAL) {
      throw { errCode: 1006, errMsg: "冷却中" };
    }
    if (logs.length >= AD_CD && moment().diff(logs[AD_CD - 1].time) <= AD_DELAY_TIME) {
      throw { errCode: 1006, errMsg: "本轮广告看完了,请稍后再试!" };
    }
    return true;
  },
  async add(openid) {
    let data = { openid, day: moment().format("yyyy-MM-DD"), time: moment().format("YYYY-MM-DD HH:mm:ss") };
    await this.collection.add({ data });
  }
};
