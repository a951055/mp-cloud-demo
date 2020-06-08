const cloud = require("wx-server-sdk");
const moment = require("moment");

const COLLECTION_Z = "z";
const COLLECTION_H = "h";
const COLLECTION_E = "e";

const HUA_TO_HOT = 10;
const EXCHANGE_TO_HOT = 5;

exports.getAll = async () => {
  let db = cloud.database();
  let $ = db.command.aggregate;
  let c = db.collection(COLLECTION_Z);
  let day = moment().format("yyyy-MM-DD");
  let res = await c
    .aggregate()
    .project({ _id: 0, index: 1, current: 1, rank: 1 })
    .match({ current: true })
    .lookup({
      from: COLLECTION_H, // 联合查询
      localField: "index",
      foreignField: "index",
      as: "hua"
    })
    .lookup({
      from: COLLECTION_E, // 联合查询
      localField: "index",
      foreignField: "index",
      as: "exchange"
    })
    .addFields({
      // 转换统计数据
      exchangeWeek: $.filter({
        input: "$exchange",
        as: "item",
        cond: $.eq([
          $.isoWeek($.dateFromString({ dateString: "$$item.day" })),
          $.isoWeek($.dateFromString({ dateString: day }))
        ])
      }),

      huaWeek: $.filter({
        input: "$hua",
        as: "item",
        cond: $.eq([
          $.isoWeek($.dateFromString({ dateString: "$$item.day" })),
          $.isoWeek($.dateFromString({ dateString: day }))
        ])
      })
    })
    .addFields({
      // 统计分数
      hot: {
        week: $.add([
          $.multiply([$.size("$huaWeek"), HUA_TO_HOT]),
          $.multiply([$.size("$exchangeWeek"), EXCHANGE_TO_HOT])
        ]),
        month: $.add([$.multiply([$.size("$hua"), HUA_TO_HOT]), $.multiply([$.size("$exchange"), EXCHANGE_TO_HOT])])
      }
    })
    .project({ index: 1, current: 1, hot: 1, rank: 1 })
    .limit(1)
    .end();
  return res.list[0];
};

exports.give = async ({ openid, index }) => {
  let db = cloud.database();
  let z = db.collection(COLLECTION_Z);
  let c = db.collection(COLLECTION_H);
  let day = moment().format("yyyy-MM-DD");
  index = index || (await z.where({ current: true }).get()).data[0].index;
  try {
    await c.add({ data: { index, day, user: openid } });
  } catch (error) {
    throw { errMsg: "写入失败" };
  }
};

exports.exchange = async ({ openid, index }) => {
  let db = cloud.database();
  let z = db.collection(COLLECTION_Z);
  let c = db.collection(COLLECTION_H);
  let day = moment().format("yyyy-MM-DD");
  index = index || (await z.where({ current: true }).get()).data[0].index;
  await c.add({ data: { index, day, user: openid } });
  try {
    await c.add({ data: { index, day, user: openid } });
  } catch (error) {
    throw { errMsg: "写入失败" };
  }
};
