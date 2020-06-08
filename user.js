const cloud = require("wx-server-sdk");
const moment = require("moment");

const COLLECTION_U = "u";
const COLLECTION_H = "h";
const COLLECTION_E = "e";

const CONSUME_HUA = 1; // 每次消耗花数量
const CONSUME_EXCHANGE = 3; // 每次消耗点击次数

const HUA_TO_HOT = 10;
const EXCHANGE_TO_HOT = 5;

/** 用户数据操作 */
exports.userCommond = openid => {
  return {
    user: null,
    get collection() {
      return cloud.database().collection(COLLECTION_U);
    },
    /** 加载 - 读取或者初始化用户信息 */
    async read() {
      let uds = await this.collection.where({ openid }).get();
      this.user = (uds || { data: [] }).data[0] || {
        isNew: true,
        openid,
        hua: 0,
        count: {
          val: 0,
          used: 0,
          time: moment().format("yyyy-MM-DD")
        }
      };
      // fix
      if (moment(this.user.count.time).diff(moment().format("yyyy-MM-DD")) < 0) {
        this.user.count = { val: 0, used: 0, time: moment().format("yyyy-MM-DD") };
      }
    },
    /** 写入数据库 */
    async write() {
      if (!this.user.isNew) {
        // 更新信息
        delete this.user._id;
        await this.collection.where({ openid }).update({ data: this.user });
      } else {
        // 创建新用户
        delete this.user.isNew;
        await this.collection.add({ data: this.user });
      }
    },
    /** 验证 */
    valiation() {
      if (!this.user) return { hua: false, exchange: false };
      return {
        hua: this.user.hua >= CONSUME_HUA,
        exchange: this.user.count.val - this.user.count.used >= CONSUME_EXCHANGE
      };
    },
    /** 消耗 */
    consume(type) {
      if (type == "hua") this.user.hua -= CONSUME_HUA;
      else this.user.count.used += CONSUME_EXCHANGE;
    },
    /** 获得 */
    getted(type) {
      if (type == "hua") this.user.hua++;
      else this.user.count.val++;
      this.user.count.time = moment().format("yyyy-MM-DD");
    }
  };
};

exports.count = async openid => {
  let db = cloud.database();
  let _ = db.command;
  let $ = db.command.aggregate;
  let c = db.collection(COLLECTION_U);
  let day = moment().format("yyyy-MM-DD");
  let res = await c
    .aggregate()
    .match({ openid: $.eq(openid) })
    .lookup({
      from: COLLECTION_H,
      let: { openid: "$openid" },
      pipeline: $.pipeline()
        .match(_.expr(_.eq(["$$openid", "$user"])))
        .project({ _id: 0, day: 1 })
        .done(),
      as: "hua"
    })
    .lookup({
      from: COLLECTION_E,
      let: { openid: "$openid" },
      pipeline: $.pipeline()
        .match(_.expr(_.eq(["$$openid", "$user"])))
        .project({ _id: 0, day: 1 })
        .done(),
      as: "exchange"
    })
    .addFields({
      // 联合查询 - 兑换
      exchangeDay: $.filter({
        input: "$exchange",
        as: "item",
        cond: $.eq(["$$item.day", day])
      }),
      exchangeWeek: $.filter({
        input: "$exchange",
        as: "item",
        cond: $.eq([
          $.isoWeek($.dateFromString({ dateString: "$$item.day" })),
          $.isoWeek($.dateFromString({ dateString: day }))
        ])
      })
    })
    .addFields({
      // 联合查询 - 花
      huaDay: $.filter({
        input: "$hua",
        as: "item",
        cond: $.eq(["$$item.day", day])
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
        day: $.add([
          $.multiply([$.size("$huaDay"), HUA_TO_HOT]),
          $.multiply([$.size("$exchangeDay"), EXCHANGE_TO_HOT])
        ]),
        week: $.add([
          $.multiply([$.size("$huaWeek"), HUA_TO_HOT]),
          $.multiply([$.size("$exchangeWeek"), EXCHANGE_TO_HOT])
        ]),
        month: $.add([$.multiply([$.size("$hua"), HUA_TO_HOT]), $.multiply([$.size("$exchange"), EXCHANGE_TO_HOT])])
      }
    })
    .project({ index: 1, current: 1, hot: 1 })
    .group({
      _id: "$index",
      index: $.first("$index"),
      current: $.first("$current"),
      hot: $.first("$hot")
    })
    .replaceRoot({
      newRoot: "$hot"
    })
    .end();
  return res.list[0];
};
