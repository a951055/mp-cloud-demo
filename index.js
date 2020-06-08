const cloud = require("wx-server-sdk");
const delay = time => new Promise(resolve => setTimeout(() => resolve(), time || 100));
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const { getAll, give, exchange } = require("./zb");
const { userCommond, count } = require("./user");
const { ad } = require("./ad");

const AD_CONFIG = { video: "adunit-66c8bc564045ebcf" };

/** 查询openid */
const asyncSelectOpenid = async (n = 0) => {
  let openid = cloud.getWXContext().OPENID;
  if (openid) return openid;
  else if (n <= 5) return (await delay(1000)) && (await asyncSelectOpenid(n + 1));
  throw { errCode: 1001, errMsg: "获取用户openid失败" };
};

/** */
exports.main = async data => {
  let { method, openid, isEnded } = data;
  console.log(`[method]`, method);
  try {
    if (!openid) openid = await asyncSelectOpenid(); // 等待openid加载
    if (method == "get") {
      // 获取数据
      let zb = await getAll(); // 主播: 热力值 , 日排名, 周排名, 月排名
      // 用户 花 , 今日点击次数, 最近一个月的助力数据 , 助力排名
      let usd = userCommond(openid);
      await usd.read();
      await usd.write(); // 仅记录
      let rank = await count(openid);
      return {
        result: true,
        errMsg: "getted latest data",
        data: { openid, zb, user: { ...usd.user, rank } }
      };
    }
    if (method == "invoke-ad") {
      // 调用广告检查
      let result = await ad.check(openid);
      return { result, errMsg: "allow invoke", data: { config: AD_CONFIG } };
    }
    if (method == "submit-ad-result") {
      await ad.add(openid); // 记录广告播放
      let usd = userCommond(openid);
      await usd.read();
      usd.getted("exchange"); // 记一次播放次数
      if (isEnded) usd.getted("hua"); // 获得一朵花
      await usd.write(); // 写入
      return { result: true, errMsg: "logged", user: {} };
    }
    if (method == "give") {
      // 赠送
      let usd = userCommond(openid);
      await usd.read();
      if (usd.valiation().hua) {
        usd.consume("hua"); // 消耗花
        await usd.write(); // 写入
        await give({ openid });
        return { result: true, errMsg: "已扣除" };
      }
      throw { errCode: 1004, errMsg: "抱歉,您的玫瑰数量不足" };
    }
    if (method == "exchange") {
      // 兑换
      let usd = userCommond(openid);
      await usd.read();
      if (usd.valiation().exchange) {
        usd.consume("exchange"); // 消耗点击次数
        await usd.write(); // 写入
        await exchange({ openid });
        return { result: true, errMsg: "已扣除" };
      }
      throw { errCode: 1004, errMsg: "抱歉,您的点数不足" };
    }
    throw { errCode: 1003, errMsg: "未知方法" };
  } catch (error) {
    return {
      result: false,
      errCode: error.errCode,
      errMsg: error.errMsg,
      error
    };
  }
};
