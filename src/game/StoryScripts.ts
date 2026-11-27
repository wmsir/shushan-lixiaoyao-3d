import type { EpisodeChoiceDef, StageDef, StageDialogueDef, StageDialogueLine } from './CampaignData';

export interface EpisodeStoryScript {
  lines: StageDialogueLine[];
  choices: [EpisodeChoiceDef, EpisodeChoiceDef];
  bossCutsceneTaunt?: string;
  bossEnrageLine?: string;
}

const SCRIPT_BIOME_LABELS: Record<string, string> = {
  bamboo_canyon: '翠竹云溪',
  peach_shrine: '十里桃源',
  sword_graveyard: '古剑荒冢',
  lava_abyss: '赤焰火狱',
  celestial_sanctum: '星穹天坛',
  haven_camp: '云来剑庐',
};

export const EPISODE_STORY_SCRIPTS: Record<number, EpisodeStoryScript> = {
  1: {
    lines: [
      {
        speaker: '蜀山接引长老',
        role: 'elder',
        seal: '剑',
        text: '「锁妖塔北角封印忽现裂隙，妖煞已沿翠竹石阶潜入外门！见敌红圈蓄力可按「弹反」破势，遇「危」字红震速以「闪避」避锋！」',
      },
      {
        speaker: '狂雷先锋',
        role: 'enemy',
        seal: '妖',
        text: '「桀桀！蜀山护山大阵已松动半寸，今晚先拿你们这几个外门弟子祭旗！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「既敢踏入蜀山山门，便拿我这口青钢古剑试一试你们几斤几两！」',
      },
    ],
    choices: [
      {
        id: 'ep1_strike',
        title: '迎锋直进 · 夺势先斩',
        subtitle: '剑伤 +14% · 开局剑意 +28',
        storyHint: '抢在妖锋合围前御剑破阵',
        heroReply: '「师兄且替我掠阵！山门岂容妖邪撒野，且看我一剑扫清石阶！」',
        battleCallout: '夺势先斩 · 剑锋破云！',
        dmgBonus: 0.14,
        ultBonus: 28,
      },
      {
        id: 'ep1_guard',
        title: '沉心凝气 · 守御灵泉',
        subtitle: '移速 +12% · 气血 +42 · 灵葫 +1',
        storyHint: '稳守石阶借风身法周旋破招',
        heroReply: '「不急，待我看清这群妖卒的招路与狂雷余波，再一剑定音！」',
        battleCallout: '御风守御 · 稳步清阶！',
        speedBonus: 0.12,
        hpBonus: 42,
        extraGourd: 1,
      },
    ],
  },
  2: {
    lines: [
      {
        speaker: '同门 · 玄影',
        role: 'ally',
        seal: '影',
        text: '「逍遥师弟小心！溪涧两岸的幽冥符师正借重甲盾锋作掩护，切莫陷入前后夹击。」',
      },
      {
        speaker: '重甲盾锋',
        role: 'enemy',
        seal: '妖',
        text: '「玄铁重盾在前，阴符鬼火在后，蜀山剑修今日插翅难飞！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「重盾虽厚，也挡不住御剑穿心！师兄放心，这一关交给我来拆阵。」',
      },
    ],
    choices: [
      {
        id: 'ep2_strike',
        title: '御剑穿盾 · 强斩术师',
        subtitle: '剑伤 +14% · 开局剑意 +28',
        storyHint: '高爆剑意强破重甲与后排符阵',
        heroReply: '「重甲盾锋交由天剑破势，看我直取后方幽冥符师！」',
        battleCallout: '御剑穿盾 · 直捣阵眼！',
        dmgBonus: 0.14,
        ultBonus: 28,
      },
      {
        id: 'ep2_guard',
        title: '踏水绕袭 · 灵泉续战',
        subtitle: '移速 +12% · 气血 +42 · 灵葫 +1',
        storyHint: '借云溪轻身步法游走避开夹击',
        heroReply: '「师兄替我盯紧石阶北口，我踏水迂回，专斩两翼符师！」',
        battleCallout: '踏水凌波 · 游击破围！',
        speedBonus: 0.12,
        hpBonus: 42,
        extraGourd: 1,
      },
    ],
  },
  3: {
    lines: [
      {
        speaker: '同门 · 玄影',
        role: 'ally',
        seal: '影',
        text: '「十里桃林竟染上了阴煞紫雾……三名术师正以三才阴符阵抽取桃源灵脉！」',
      },
      {
        speaker: '阵眼大术师',
        role: 'enemy',
        seal: '妖',
        text: '「桃林灵气已归幽冥所有！待阵成之时，整座外门皆成焦土！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「毁我蜀山桃林，也敢妄言称尊？今日必叫你这三才阴阵碎作满地残符！」',
      },
    ],
    choices: [
      {
        id: 'ep3_peach_blade',
        title: '花影递剑 · 破阵争先',
        subtitle: '剑伤 +15% · 开局剑意 +30',
        storyHint: '趁阵眼未稳一鼓作气强杀大术师',
        heroReply: '「莫等阴阵合拢，我直接乘剑气疾冲阵眼！」',
        battleCallout: '花影递剑 · 斩断阵脉！',
        dmgBonus: 0.15,
        ultBonus: 30,
      },
      {
        id: 'ep3_peach_breeze',
        title: '踏花凌波 · 灵泉护心',
        subtitle: '移速 +13% · 气血 +45 · 灵葫 +1',
        storyHint: '吐纳桃林残余灵息抵御阴符侵蚀',
        heroReply: '「桃林灵气尚存一线，先护住心脉游斗，逐一剪除护法妖剑！」',
        battleCallout: '踏花凌波 · 灵息护体！',
        speedBonus: 0.13,
        hpBonus: 45,
        extraGourd: 1,
      },
    ],
  },
  4: {
    lines: [
      {
        speaker: '蜀山接引长老',
        role: 'elder',
        seal: '剑',
        text: '「山门将复，唯血甲都尉·斩岳亲自率铁骑压阵。此僚霸体刚猛，须待其红圈蓄力时弹反破势！」',
      },
      {
        speaker: '血甲都尉 · 斩岳',
        role: 'enemy',
        seal: '将',
        text: '「一群只敢躲在剑阵后的鼠辈！接得住本都尉十斤血刃三招不死，便算你蜀山有人！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「区区十斤重刃也敢夸口？你斩过来试试，看是你的刀快，还是我的剑快！」',
      },
    ],
    choices: [
      {
        id: 'ep4_strike',
        title: '剑格硬撼 · 破势断刃',
        subtitle: '剑伤 +14% · 开局剑意 +28',
        storyHint: '以攻对攻，抢积剑意破开霸体',
        heroReply: '「斩岳！三招太多，一记完美弹反便足以令你伏地！」',
        battleCallout: '铁骑虽猛 · 一剑破势！',
        dmgBonus: 0.14,
        ultBonus: 28,
      },
      {
        id: 'ep4_guard',
        title: '虚步诱敌 · 巧卸重锋',
        subtitle: '移速 +12% · 气血 +42 · 灵葫 +1',
        storyHint: '保持身位看清红光前摇再反击',
        heroReply: '「狂刀力尽必露破绽，待我闪过这轮铁骑冲阵，再取他首级！」',
        battleCallout: '避锋击虚 · 伺机弹反！',
        speedBonus: 0.12,
        hpBonus: 42,
        extraGourd: 1,
      },
    ],
  },
  5: {
    lines: [
      {
        speaker: '师尊 · 酒剑仙',
        role: 'elder',
        seal: '酒',
        text: '「臭小子，山门最后一关的玄甲镇门将曾吞过锁妖残魂，千万别大意——喝口酒，稳住手腕再拔剑！」',
      },
      {
        speaker: '玄甲镇门将 · 破岳',
        role: 'enemy',
        seal: '魔',
        text: '「蜀山小儿！凡过此桃源古门者，骨碎魂散，先过本将手中玄铁巨剑！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「师尊放心！今夜十里桃源漫天落花，正适合替这魔将送葬！」',
      },
    ],
    choices: [
      {
        id: 'ep5_peach_blade',
        title: '花雨凝锋 · 烈酒壮剑',
        subtitle: '剑伤 +15% · 开局剑意 +30',
        storyHint: '以酒剑仙凌厉剑意正面硬撼破岳',
        heroReply: '「破岳！今日便让你见识见识，什么才是蜀山御剑真传！」',
        battleCallout: '蜀山御剑 · 斩魔破岳！',
        dmgBonus: 0.15,
        ultBonus: 30,
      },
      {
        id: 'ep5_peach_breeze',
        title: '醉步穿花 · 后发制敌',
        subtitle: '移速 +13% · 气血 +45 · 灵葫 +1',
        storyHint: '效法醉仙身法躲避重劈蓄力后反杀',
        heroReply: '「重剑虽沉，转身却慢！师尊看好，徒儿用醉步闪身斩他！」',
        battleCallout: '醉步穿花 · 灵动破岳！',
        speedBonus: 0.13,
        hpBonus: 45,
        extraGourd: 1,
      },
    ],
    bossCutsceneTaunt: '玄甲镇门将 · 破岳：「千斤玄甲在此，蜀山小儿谁敢上前受死！」',
    bossEnrageLine: '玄甲镇门将 · 破岳：「竟能伤我金身？吃我破岳魔剑震天！」',
  },

  // ===================== 第二章：剑冢幽冥 (6–10) =====================
  6: {
    lines: [
      {
        speaker: '剑冢守碑灵',
        role: 'elder',
        seal: '碑',
        text: '「踏入古剑冢，前朝战死剑修的残剑都在悲鸣。此间魔兵染了疾风煞气，切记以极限闪避的「瞬影斩」夺回先手！」',
      },
      {
        speaker: '疾风魔将 · 掠影',
        role: 'enemy',
        seal: '魔',
        text: '「活着走进剑冢的活人，血肉最是鲜美……先让我看看你的眼神跟不跟得上我的剑！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「以剑为冢，本是英烈安息之地，岂容你们这群阴沟魔物亵渎！」',
      },
    ],
    choices: [
      {
        id: 'ep6_grave_resonance',
        title: '古剑共鸣 · 剑意如虹',
        subtitle: '剑伤 +16% · 开局剑意 +34',
        storyHint: '引动荒原断剑残意共鸣杀敌',
        heroReply: '「前辈英魂借我一剑！荒原魔煞，今日尽数伏诛！」',
        battleCallout: '古剑共鸣 · 破风斩影！',
        dmgBonus: 0.16,
        ultBonus: 34,
      },
      {
        id: 'ep6_grave_ward',
        title: '残碑定神 · 守御化煞',
        subtitle: '移速 +12% · 气血 +52 · 灵葫 +1',
        storyHint: '固守心神以快打快反制疾风突袭',
        heroReply: '「风再快也有迹可循，待我听风辨位，一招瞬影定胜负！」',
        battleCallout: '听风辨位 · 瞬影破煞！',
        speedBonus: 0.12,
        hpBonus: 52,
        extraGourd: 1,
      },
    ],
  },
  7: {
    lines: [
      {
        speaker: '剑冢守碑灵',
        role: 'elder',
        seal: '碑',
        text: '「不好！鬼火祭坛已被妖众点亮，九天紫雷即将随阵法劈落！见到脚下紫红雷印务必立刻踏云闪出！」',
      },
      {
        speaker: '紫雷剑魔 · 震霆',
        role: 'enemy',
        seal: '魔',
        text: '「听见这满坛鬼火与雷鸣了吗？待天雷劈散你的护体真气，便是你的死期！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「天雷乃天地正气所化，你们窃雷行凶，也不怕反遭天谴？」',
      },
    ],
    choices: [
      {
        id: 'ep7_grave_resonance',
        title: '以剑引雷 · 强攻祭坛',
        subtitle: '剑伤 +16% · 开局剑意 +34',
        storyHint: '趁紫雷间隙先斩唤雷冥师',
        heroReply: '「少装神弄鬼！先斩了那几个唤雷术师，看你这破祭坛还如何作祟！」',
        battleCallout: '剑引清霄 · 先斩雷师！',
        dmgBonus: 0.16,
        ultBonus: 34,
      },
      {
        id: 'ep7_grave_ward',
        title: '踏云避雷 · 稳守反扑',
        subtitle: '移速 +12% · 气血 +52 · 灵葫 +1',
        storyHint: '加快身法在紫雷预警圈中从容腾挪',
        heroReply: '「九天紫雷虽烈，只要脚步够快，反倒成了照亮你破绽的灯火！」',
        battleCallout: '踏云避雷 · 反击震霆！',
        speedBonus: 0.12,
        hpBonus: 52,
        extraGourd: 1,
      },
    ],
  },
  8: {
    lines: [
      {
        speaker: '同门 · 玄影',
        role: 'ally',
        seal: '影',
        text: '「前方正是剑冢咽喉，魔君座下「破军」「贪狼」双煞并肩拦道——一快一稳，万不可被两人前后合扣！」',
      },
      {
        speaker: '血甲双煞 · 破军与贪狼',
        role: 'enemy',
        seal: '魔',
        text: '「一个霸体镇前，一个疾风断后！蜀山弟子，乖乖留下来给赤霄魔君当磨剑石吧！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「以二敌一还敢自称护法？今日便让你们见识万剑诀如何一并收网！」',
      },
    ],
    choices: [
      {
        id: 'ep8_grave_resonance',
        title: '万剑压阵 · 逐一击破',
        subtitle: '剑伤 +16% · 开局剑意 +34',
        storyHint: '先蓄万剑与天剑重创疾风左使',
        heroReply: '「疾风破军先吃我一记万剑诀！少了一个，看那贪狼还怎么合围！」',
        battleCallout: '万剑齐下 · 斩断双煞！',
        dmgBonus: 0.16,
        ultBonus: 34,
      },
      {
        id: 'ep8_grave_ward',
        title: '分身错位 · 各个击破',
        subtitle: '移速 +12% · 气血 +52 · 灵葫 +1',
        storyHint: '拉开身位避免双煞同时出手',
        heroReply: '「双煞最怕阵型被拉散，我踏步游走，逐个拆了你们的合击！」',
        battleCallout: '拉扯破阵 · 孤立双煞！',
        speedBonus: 0.12,
        hpBonus: 52,
        extraGourd: 1,
      },
    ],
  },
  9: {
    lines: [
      {
        speaker: '剑冢守碑灵',
        role: 'elder',
        seal: '碑',
        text: '「大事不妙！赤霄魔君惊觉大阵将破，已驱使三波妖军从四面残碑围城反扑！守住剑心，熬过三阵！」',
      },
      {
        speaker: '剑冢督军 · 铁煞',
        role: 'enemy',
        seal: '将',
        text: '「全军压上！哪怕用尸骸填平这座石台，也绝不准他活着走到魔君殿前！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「来多少斩多少！正好借你们三波妖军，替我养出一道贯日天剑！」',
      },
    ],
    choices: [
      {
        id: 'ep9_grave_resonance',
        title: '以战养剑 · 怒斩围城',
        subtitle: '剑伤 +16% · 开局剑意 +34',
        storyHint: '高烈度剑伤速清前两波魔卒法尊',
        heroReply: '「三波围城？正好让七星龙渊饮个痛快，省得一会殿前还要热身！」',
        battleCallout: '以战养剑 · 连破三阵！',
        dmgBonus: 0.16,
        ultBonus: 34,
      },
      {
        id: 'ep9_grave_ward',
        title: '固本清源 · 蓄势待决',
        subtitle: '移速 +12% · 气血 +52 · 灵葫 +1',
        storyHint: '多备灵葫应对三波车轮鏖战与嗜血死士',
        heroReply: '「三波车轮鏖战最忌气竭，有灵葫仙酿与清泉相助，我稳守到底！」',
        battleCallout: '固本守阵 · 决胜围城！',
        speedBonus: 0.12,
        hpBonus: 52,
        extraGourd: 1,
      },
    ],
  },
  10: {
    lines: [
      {
        speaker: '师尊 · 酒剑仙',
        role: 'elder',
        seal: '酒',
        text: '「赤霄魔君当年也是半步入道的剑修，因痴迷杀伐才堕入魔道。别留情——送他解脱，重固剑冢封印！」',
      },
      {
        speaker: '剑冢血尊 · 赤霄魔君',
        role: 'enemy',
        seal: '魔',
        text: '「葬身剑冢的万千剑魂皆是我剑下养料！蜀山后生，把你的剑意也献给本尊吧！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「剑本为护人而生，你以剑噬魂已失本心！今日我代蜀山先贤收回这柄魔剑！」',
      },
    ],
    choices: [
      {
        id: 'ep10_grave_resonance',
        title: '正气诛魔 · 问剑赤霄',
        subtitle: '剑伤 +16% · 开局剑意 +34',
        storyHint: '以浩然剑气正面压制赤霄断岳重剑',
        heroReply: '「魔道终究难敌正气！赤霄，接我蜀山七星天剑！」',
        battleCallout: '剑问赤霄 · 重固剑冢！',
        dmgBonus: 0.16,
        ultBonus: 34,
      },
      {
        id: 'ep10_grave_ward',
        title: '灵台清明 · 化雷破尊',
        subtitle: '移速 +12% · 气血 +52 · 灵葫 +1',
        storyHint: '防范血雷天罚同时捕捉魔君重剑硬直',
        heroReply: '「魔焰再炽也乱不了我的剑心！躲开血雷天罚，一剑斩他归墟！」',
        battleCallout: '灵台清明 · 破血雷阵！',
        speedBonus: 0.12,
        hpBonus: 52,
        extraGourd: 1,
      },
    ],
    bossCutsceneTaunt: '剑冢血尊 · 赤霄魔君：「剑冢万魂哀鸣——蜀山小儿，且看本尊断岳血雷！」',
    bossEnrageLine: '剑冢血尊 · 赤霄魔君：「好锋利的剑！既如此，本尊便燃尽残魂劈碎你！」',
  },

  // ===================== 第三章：锁妖深渊 (11–15) =====================
  11: {
    lines: [
      {
        speaker: '锁妖塔镇守灵官',
        role: 'elder',
        seal: '镇',
        text: '「此处已是锁妖塔深渊火狱！地脉岩浆随时自石台喷涌，炎甲魔卒身披重铁，善用四连重击与剑气破盾！」',
      },
      {
        speaker: '炎狱校尉 · 焚骨',
        role: 'enemy',
        seal: '魔',
        text: '「三百年来敢踏入火狱的蜀山人，骨灰早就融进岩浆里了，你也想来凑数吗？」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「火狱再烫，也烫不熄我手中三尺青锋！让开深渊通道！」',
      },
    ],
    choices: [
      {
        id: 'ep11_lava_cleave',
        title: '焚锋斩狱 · 烈焰增威',
        subtitle: '剑伤 +18% · 开局剑意 +38',
        storyHint: '强攻速战，不给地火久耗之机',
        heroReply: '「地火越烈，我出剑越快！趁火势未合，先劈开火狱外门！」',
        battleCallout: '焚锋斩狱 · 破火开道！',
        dmgBonus: 0.18,
        ultBonus: 38,
      },
      {
        id: 'ep11_lava_ice',
        title: '冰心镇火 · 丹元续命',
        subtitle: '移速 +12% · 气血 +62 · 灵葫 +1',
        storyHint: '护住真气稳步踏过深渊熔岩区',
        heroReply: '「心静自然寒！任凭脚下地火翻涌，我自踏步游刃有余！」',
        battleCallout: '冰心镇火 · 步稳气沉！',
        speedBonus: 0.12,
        hpBonus: 62,
        extraGourd: 1,
      },
    ],
  },
  12: {
    lines: [
      {
        speaker: '锁妖塔镇守灵官',
        role: 'elder',
        seal: '镇',
        text: '「前方魔众皆修习【嗜血】邪法，刀锋沾血便能自愈！切忌硬拼换血，必以格挡弹反与踏云闪避克之！」',
      },
      {
        speaker: '血海魔统 · 噬魂',
        role: 'enemy',
        seal: '魔',
        text: '「你的每一次受伤，都会让本统领更加强壮！来吧，把鲜血泼洒在祭坛上！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「沾不着我的衣角，我看你拿什么回血？今天让你一滴血也吸不到！」',
      },
    ],
    choices: [
      {
        id: 'ep12_lava_cleave',
        title: '雷霆秒杀 · 断其嗜血',
        subtitle: '剑伤 +18% · 开局剑意 +38',
        storyHint: '高爆发压血线，令嗜血魔将无暇自愈',
        heroReply: '「只要一剑斩得够重，连回血的喘息机会都不会留给你！」',
        battleCallout: '重剑绝杀 · 断绝血祭！',
        dmgBonus: 0.18,
        ultBonus: 38,
      },
      {
        id: 'ep12_lava_ice',
        title: '滴水不沾 · 极闪反刺',
        subtitle: '移速 +12% · 气血 +62 · 灵葫 +1',
        storyHint: '极速走位零失误触发瞬影斩与弹反',
        heroReply: '「嗜血邪功最怕碰不到人！看我身法穿花，让你空挥到力竭！」',
        battleCallout: '滴血不沾 · 瞬影反刺！',
        speedBonus: 0.12,
        hpBonus: 62,
        extraGourd: 1,
      },
    ],
  },
  13: {
    lines: [
      {
        speaker: '同门 · 玄影',
        role: 'ally',
        seal: '影',
        text: '「青龙、白虎、朱雀、玄武四名幽冥法尊结成了天罗弹幕阵！近身强打易遭集火，可以御剑剑气先行点杀！」',
      },
      {
        speaker: '镇阵铁将 · 不动',
        role: 'enemy',
        seal: '将',
        text: '「四象天罗既成，漫天幽冥鬼弹如雨！谁能踏进我铁壁半步？」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「弹幕如雨又如何？别忘了阴冥弹也能被我一剑劈回你们脸上！」',
      },
    ],
    choices: [
      {
        id: 'ep13_lava_cleave',
        title: '万剑扫阵 · 先拆四象',
        subtitle: '剑伤 +18% · 开局剑意 +38',
        storyHint: '以万剑诀覆盖四象术师阵脚',
        heroReply: '「区区四象邪阵，看我飞剑劈弹、万剑齐落，瞬间拆它个稀巴烂！」',
        battleCallout: '剑劈阴弹 · 摧毁四象！',
        dmgBonus: 0.18,
        ultBonus: 38,
      },
      {
        id: 'ep13_lava_ice',
        title: '踏隙穿弹 · 各个点破',
        subtitle: '移速 +12% · 气血 +62 · 灵葫 +1',
        storyHint: '高速穿行弹幕隙间逐一点杀法尊',
        heroReply: '「多谢师兄提醒，我贴墙游走，专挑四象死角逐个拔除！」',
        battleCallout: '穿弹掠阵 · 逐一拔除！',
        speedBonus: 0.12,
        hpBonus: 62,
        extraGourd: 1,
      },
    ],
  },
  14: {
    lines: [
      {
        speaker: '锁妖塔镇守灵官',
        role: 'elder',
        seal: '镇',
        text: '「深渊门户已近！烈穹与碎魂乃炎狱妖王左膀右臂，一狂雷一嗜血同时压境，蓄满天剑一举破局！」',
      },
      {
        speaker: '炎狱双王 · 烈穹与碎魂',
        role: 'enemy',
        seal: '魔',
        text: '「敢闯过前面十三层已是奇迹，但火狱双王联手之下，绝没有生还的道理！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「越是绝境，剑意越盛！你们两个一起上吧，省得我多拔一次剑！」',
      },
    ],
    choices: [
      {
        id: 'ep14_lava_cleave',
        title: '天剑并斩 · 断其联手',
        subtitle: '剑伤 +18% · 开局剑意 +38',
        storyHint: '开局高剑意抢放天剑与万剑归宗',
        heroReply: '「双王联手？正好吃我一式天剑并斩，双双折戟火狱！」',
        battleCallout: '天剑破局 · 力撼双王！',
        dmgBonus: 0.18,
        ultBonus: 38,
      },
      {
        id: 'ep14_lava_ice',
        title: '太极周旋 · 卸力斩魂',
        subtitle: '移速 +12% · 气血 +62 · 灵葫 +1',
        storyHint: '充沛气血与灵葫稳住双将高压围攻',
        heroReply: '「一人引雷一人嗜血，我先斩嗜血碎魂，再破烈穹狂雷！」',
        battleCallout: '太极周旋 · 各个诛灭！',
        speedBonus: 0.12,
        hpBonus: 62,
        extraGourd: 1,
      },
    ],
  },
  15: {
    lines: [
      {
        speaker: '师尊 · 酒剑仙',
        role: 'elder',
        seal: '酒',
        text: '「徒儿，前面那炎狱妖王在锁妖塔底熬了三百年地火，脾气爆得很！记住，火越旺时破绽越明显！」',
      },
      {
        speaker: '焚天剑圣 · 炎狱妖王',
        role: 'enemy',
        seal: '魔',
        text: '「三百年地火淬剑，连这锁妖塔砖石都已烧作焦铁！今日便拿你蜀山正宗剑修试锋！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「锁妖塔关你三百年未曾悔改，反倒妄称剑圣？今日便让你看看何为蜀山真剑！」',
      },
    ],
    choices: [
      {
        id: 'ep15_lava_cleave',
        title: '烈火试锋 · 一剑破炎',
        subtitle: '剑伤 +18% · 开局剑意 +38',
        storyHint: '以更猛烈剑势正面镇压焚天妖王',
        heroReply: '「三百年火气今日一剑替你散尽！师尊且饮一杯，看徒儿斩妖！」',
        battleCallout: '剑寒深渊 · 镇压炎狱！',
        dmgBonus: 0.18,
        ultBonus: 38,
      },
      {
        id: 'ep15_lava_ice',
        title: '云水归心 · 灭焰定魂',
        subtitle: '移速 +12% · 气血 +62 · 灵葫 +1',
        storyHint: '躲开焚天火劫喷发并伺机反制',
        heroReply: '「火劫虽炽，难越我蜀山云水身法！待你力竭之时，便是伏诛之刻！」',
        battleCallout: '云水灭焰 · 稳斩妖王！',
        speedBonus: 0.12,
        hpBonus: 62,
        extraGourd: 1,
      },
    ],
    bossCutsceneTaunt: '焚天剑圣 · 炎狱妖王：「三百年焚天之怒——今日谁敢接我一记地火剑煞！」',
    bossEnrageLine: '焚天剑圣 · 炎狱妖王：「地火沸腾！本尊要将整座剑台化作熔炉！」',
  },

  // ===================== 第四章：九幽绝巅 (16–20) =====================
  16: {
    lines: [
      {
        speaker: '师尊 · 酒剑仙',
        role: 'elder',
        seal: '酒',
        text: '「穿过火狱便是九幽绝巅星穹天坛……镇狱天尊正在巅顶重塑魔躯！徒儿，此去每一步皆是天劫！」',
      },
      {
        speaker: '九幽镇将 · 绝尘',
        role: 'enemy',
        seal: '魔',
        text: '「天尊法旨：凡登九幽玄阶者，无论何门何派，格杀勿论！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「玄阶再险，挡不住我赴巅之志！你这九幽镇将，退开还是受死？」',
      },
    ],
    choices: [
      {
        id: 'ep16_star_heaven',
        title: '引星入剑 · 天剑凌霄',
        subtitle: '剑伤 +20% · 开局剑意 +42',
        storyHint: '借星穹玄阶清辉凝聚凌霄天剑',
        heroReply: '「星河垂落之处，皆是我蜀山剑域！看剑！」',
        battleCallout: '引星入剑 · 破九幽阶！',
        dmgBonus: 0.2,
        ultBonus: 42,
      },
      {
        id: 'ep16_star_taiji',
        title: '太极化劫 · 星穹护体',
        subtitle: '移速 +14% · 气血 +72 · 灵葫 +1',
        storyHint: '以浑厚气血抵御九幽天劫雷阵',
        heroReply: '「天劫越密，越要守定元神！我一步一莲，稳登九幽！」',
        battleCallout: '太极化劫 · 稳步登巅！',
        speedBonus: 0.14,
        hpBonus: 72,
        extraGourd: 1,
      },
    ],
  },
  17: {
    lines: [
      {
        speaker: '同门 · 玄影',
        role: 'ally',
        seal: '影',
        text: '「师弟当心！前方孤云、惊鸿双剑豪舍弃了甲胄，全身灌注极速邪气——一剑慢了便是生死之别！」',
      },
      {
        speaker: '双剑豪 · 孤云与惊鸿',
        role: 'enemy',
        seal: '魔',
        text: '「天下剑道唯快不破！你若连我二人的剑影都看不真切，还是趁早自裁吧！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「快剑之中自有定数！我以静制动，正要看看是你们的邪剑快，还是我的弹反快！」',
      },
    ],
    choices: [
      {
        id: 'ep17_star_heaven',
        title: '电光石火 · 以快制快',
        subtitle: '剑伤 +20% · 开局剑意 +42',
        storyHint: '极高爆发速斩脆甲双剑豪',
        heroReply: '「邪道剑豪也敢谈快？一记万剑归宗，看谁剑出如电！」',
        battleCallout: '剑出如电 · 极速决胜！',
        dmgBonus: 0.2,
        ultBonus: 42,
      },
      {
        id: 'ep17_star_taiji',
        title: '心剑合一 · 听风断影',
        subtitle: '移速 +14% · 气血 +72 · 灵葫 +1',
        storyHint: '极速身法配合弹反捕捉孤云惊鸿破绽',
        heroReply: '「快而不稳，终究是无根浮萍！待我破势反刺，一剑一个！」',
        battleCallout: '听风断影 · 弹反破豪！',
        speedBonus: 0.14,
        hpBonus: 72,
        extraGourd: 1,
      },
    ],
  },
  18: {
    lines: [
      {
        speaker: '师尊 · 酒剑仙',
        role: 'elder',
        seal: '酒',
        text: '「绝巅门前最后一道铁闸！镇山、断肠、灭世三员九幽魔将布下了三阵车轮，撑过这关便能直面镇狱天尊！」',
      },
      {
        speaker: '九幽三魔将 · 镇山',
        role: 'enemy',
        seal: '魔',
        text: '「第一阵先由本将镇山会会你！就算你能劈开铁甲，后面的嗜血与灭世也会耗死你！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「车轮战？我正好把你们三位魔将，一并送回九幽！」',
      },
    ],
    choices: [
      {
        id: 'ep18_star_heaven',
        title: '三斩定鼎 · 剑破三阵',
        subtitle: '剑伤 +20% · 开局剑意 +42',
        storyHint: '高额剑伤缩短每阵缠斗，速战速决',
        heroReply: '「霸体、嗜血、狂雷——来一将我斩一将，绝不拖泥带水！」',
        battleCallout: '三斩定鼎 · 连破魔将！',
        dmgBonus: 0.2,
        ultBonus: 42,
      },
      {
        id: 'ep18_star_taiji',
        title: '灵葫生生 · 长战不竭',
        subtitle: '移速 +14% · 气血 +72 · 灵葫 +1',
        storyHint: '丰厚续航应对三波连续高压魔将',
        heroReply: '「比内力续航，我蜀山酒剑一脉何曾怕过谁？请师尊观战！」',
        battleCallout: '生生不息 · 闯过三关！',
        speedBonus: 0.14,
        hpBonus: 72,
        extraGourd: 1,
      },
    ],
  },
  19: {
    lines: [
      {
        speaker: '同门 · 玄影',
        role: 'ally',
        seal: '影',
        text: '「快看天坛两端——噬星左尊与陨月右尊同时现身了！这是镇狱天尊最后的两道护身屏障！」',
      },
      {
        speaker: '九幽双尊 · 噬星与陨月',
        role: 'enemy',
        seal: '魔',
        text: '「能斩杀三魔将至此，确实有几分本事。可惜星陨月落之间，天尊即将苏醒，你就留在此地长眠吧！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「噬星陨月？天上星辰轮转不息，岂是你们两尊魔物所能吞噬！今日便拆了这双魔护法！」',
      },
    ],
    choices: [
      {
        id: 'ep19_star_heaven',
        title: '星陨双斩 · 威震绝巅',
        subtitle: '剑伤 +20% · 开局剑意 +42',
        storyHint: '集中火力优先重创疾风左尊·噬星',
        heroReply: '「先斩噬星左尊，再破陨月之围！天尊，洗净脖颈等着我！」',
        battleCallout: '剑撼双尊 · 决战前夜！',
        dmgBonus: 0.2,
        ultBonus: 42,
      },
      {
        id: 'ep19_star_taiji',
        title: '星穹太极 · 稳渡双劫',
        subtitle: '移速 +14% · 气血 +72 · 灵葫 +1',
        storyHint: '在双 Boss 夹击与雷阵中稳扎稳打',
        heroReply: '「双尊同台又如何？太极守中，动静由心，看我破这终局前夜！」',
        battleCallout: '太极守中 · 稳斩双尊！',
        speedBonus: 0.14,
        hpBonus: 72,
        extraGourd: 1,
      },
    ],
    bossCutsceneTaunt: '九幽双尊 · 噬星与陨月：「星辰黯淡，月落九幽——谁敢越此雷池一步！」',
    bossEnrageLine: '九幽左尊 · 噬星：「星魂燃烧！休想踏进天尊王座半步！」',
  },
  20: {
    lines: [
      {
        speaker: '师尊 · 酒剑仙',
        role: 'elder',
        seal: '酒',
        text: '「徒儿，十九重剑劫已过，前面便是万魔之源——九幽剑煞·镇狱天尊！这一剑，关乎蜀山三界百年安危！」',
      },
      {
        speaker: '九幽剑煞 · 镇狱天尊',
        role: 'enemy',
        seal: '尊',
        text: '「能一路破关至此，你倒有资格见识本尊真容。来吧，李逍遥——让我看看蜀山千年剑道，究竟能接我几招！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「师尊，三界苍生，且在此一剑！镇狱天尊，今日我便以天剑降世，将你永镇锁妖台！」',
      },
    ],
    choices: [
      {
        id: 'ep20_star_heaven',
        title: '天剑归宗 · 剑破苍穹',
        subtitle: '剑伤 +20% · 开局剑意 +42',
        storyHint: '倾尽毕生剑道锋芒，正面斩破镇狱金身',
        heroReply: '「御剑乘风来，除魔天地间！镇狱天尊——接我蜀山绝学！」',
        battleCallout: '除魔天地间 · 终战镇狱！',
        dmgBonus: 0.2,
        ultBonus: 42,
      },
      {
        id: 'ep20_star_taiji',
        title: '道心如磐 · 永镇山河',
        subtitle: '移速 +14% · 气血 +72 · 灵葫 +1',
        storyHint: '于灭世天劫中不屈周旋，耗尽天尊魔元',
        heroReply: '「纵有灭世天劫当头，我心亦如磐石！此战必胜，蜀山必安！」',
        battleCallout: '道心如磐 · 永镇九幽！',
        speedBonus: 0.14,
        hpBonus: 72,
        extraGourd: 1,
      },
    ],
    bossCutsceneTaunt: '九幽剑煞 · 镇狱天尊：「千年魔煞合流！蜀山少年，接得住本尊这一剑再谈苍生！」',
    bossEnrageLine: '九幽剑煞 · 镇狱天尊：「不可思议……竟能逼出本尊灭世真身！随我一同坠入九幽吧！」',
  },

  // ===================== 外传秘境打宝 (101–103) =====================
  101: {
    lines: [
      {
        speaker: '同门 · 玄影',
        role: 'ally',
        seal: '影',
        text: '「锁妖古陵藏有前代弟子遗落的灵品神兵，不过镇墓兽守着陵门，惊动它后会唤出铁卫死战！」',
      },
      {
        speaker: '古陵镇墓兽',
        role: 'enemy',
        seal: '妖',
        text: '「擅闯蜀山禁陵者，无论仙魔，一律留下兵刃作祭！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「前辈神兵岂能埋没魔爪之中？让我请出灵宝，再除古陵妖煞！」',
      },
    ],
    choices: [
      {
        id: 'ep101_strike',
        title: '破陵夺宝 · 剑意凌厉',
        subtitle: '剑伤 +14% · 开局剑意 +28',
        storyHint: '速清墓室守卫强斩镇墓兽',
        heroReply: '「剑出无悔，镇墓兽且看剑！」',
        battleCallout: '破陵斩煞 · 灵宝现世！',
        dmgBonus: 0.14,
        ultBonus: 28,
      },
      {
        id: 'ep101_guard',
        title: '踏阵寻宝 · 灵泉护身',
        subtitle: '移速 +12% · 气血 +42 · 灵葫 +1',
        storyHint: '稳守石陵走廊从容斩兽拾宝',
        heroReply: '「稳住身形，先把古陵守卫清干净再专心对付镇墓兽！」',
        battleCallout: '稳破古陵 · 尽收灵宝！',
        speedBonus: 0.12,
        hpBonus: 42,
        extraGourd: 1,
      },
    ],
    bossCutsceneTaunt: '古陵镇墓兽：「千年古陵沉睡已久，休想带走半件神兵！」',
    bossEnrageLine: '古陵镇墓兽：「咆哮震陵！闯陵者碎尸万段！」',
  },
  102: {
    lines: [
      {
        speaker: '剑冢守碑灵',
        role: 'elder',
        seal: '碑',
        text: '「剑冢宝窟深藏玄品剑器，却也盘踞着最凶戾的剑冢残魂与天雷阵眼，切记闪避紫色雷环！」',
      },
      {
        speaker: '剑冢残魂',
        role: 'enemy',
        seal: '魔',
        text: '「百代剑魄聚于此窟，敢来夺宝者，先接下我万怨魔剑！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「名剑有灵，择明主而栖！你这魔化残魂，不配守在这剑窟之中！」',
      },
    ],
    choices: [
      {
        id: 'ep102_grave_resonance',
        title: '共鸣玄剑 · 剑啸宝窟',
        subtitle: '剑伤 +16% · 开局剑意 +34',
        storyHint: '引窟内玄品名剑共鸣重创残魂',
        heroReply: '「诸位前辈佩剑听令——助我一剑斩散这团执念残魂！」',
        battleCallout: '玄剑共鸣 · 破窟夺锋！',
        dmgBonus: 0.16,
        ultBonus: 34,
      },
      {
        id: 'ep102_grave_ward',
        title: '静心避雷 · 稳收玄宝',
        subtitle: '移速 +12% · 气血 +52 · 灵葫 +1',
        storyHint: '避开雷法冥师与天雷剑阵稳扎稳打',
        heroReply: '「嗜血剑侍不足为惧，先避天雷，再取玄品神兵！」',
        battleCallout: '避雷破阵 · 玄品归鞘！',
        speedBonus: 0.12,
        hpBonus: 52,
        extraGourd: 1,
      },
    ],
    bossCutsceneTaunt: '剑冢残魂：「百代废剑怨气凝于一身——来战吧，夺宝人！」',
    bossEnrageLine: '剑冢残魂：「剑意沸腾！宝窟之中谁能全身而退！」',
  },
  103: {
    lines: [
      {
        speaker: '师尊 · 酒剑仙',
        role: 'elder',
        seal: '酒',
        text: '「九幽魔殿乃炼制太初仙兵的凶险绝地，魔尊不仅战力惊天，殿外灭世天劫更是无情——务必全力以赴！」',
      },
      {
        speaker: '九幽魔尊',
        role: 'enemy',
        seal: '尊',
        text: '「区区凡胎也敢窥伺太初仙品神兵？踏入本尊魔殿者，有去无回！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「太初仙兵本为正道镇魔之物，今日我既入魔殿，便必携仙兵凯旋！」',
      },
    ],
    choices: [
      {
        id: 'ep103_lava_cleave',
        title: '烈焰破殿 · 直取仙兵',
        subtitle: '剑伤 +18% · 开局剑意 +38',
        storyHint: '强破魔殿左右铁卫正面迎战魔尊',
        heroReply: '「魔殿铁卫挡不住我三剑！魔尊，亮出你的真本事吧！」',
        battleCallout: '斩殿夺仙 · 金光破霄！',
        dmgBonus: 0.18,
        ultBonus: 38,
      },
      {
        id: 'ep103_lava_ice',
        title: '玄心避劫 · 智斩魔尊',
        subtitle: '移速 +12% · 气血 +62 · 灵葫 +1',
        storyHint: '兼顾灭世天劫走位与持久鏖战',
        heroReply: '「先清妖师与嗜血右将，再从容陪魔尊过上百招！」',
        battleCallout: '避劫破殿 · 仙品必得！',
        speedBonus: 0.12,
        hpBonus: 62,
        extraGourd: 1,
      },
    ],
    bossCutsceneTaunt: '九幽魔尊：「仙品重宝就在本尊身后——跨过我的尸身再拿吧！」',
    bossEnrageLine: '九幽魔尊：「魔殿焚毁亦不让此宝落入蜀山之手！受死！」',
  },
  104: {
    lines: [
      {
        speaker: '师尊 · 酒剑仙',
        role: 'elder',
        seal: '酒',
        text: '「太虚剑墟乃上古仙兵埋骨之地，星穹双魔尊轮流镇守墟门，此战有飞剑共鸣助阵，善用御剑与万剑破局！」',
      },
      {
        speaker: '太虚魔尊 · 劫影',
        role: 'enemy',
        seal: '墟',
        text: '「凡人也敢来太虚剑墟争夺仙品？连本尊与星穹雷帝两关都过不去！」',
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「飞剑如虹贯太虚！今日便连斩双尊，取太初仙兵凯旋！」',
      },
    ],
    choices: [
      {
        id: 'ep104_star_burst',
        title: '星穹破阵 · 飞剑狂飙',
        subtitle: '剑伤 +20% · 开局剑意 +45',
        storyHint: '乘飞剑共鸣之威速斩太虚双尊',
        heroReply: '「剑意已满贯太虚，且看我连斩双魔尊！」',
        battleCallout: '太虚剑开 · 万剑朝宗！',
        dmgBonus: 0.2,
        ultBonus: 45,
      },
      {
        id: 'ep104_star_guard',
        title: '星盾护心 · 稳取仙宝',
        subtitle: '气血 +80 · 灵葫 +1 · 移速 +10%',
        storyHint: '提升容错扛过九霄雷劫连斩双王',
        heroReply: '「稳住身法化解灭世天劫，仙品神兵必归蜀山！」',
        battleCallout: '步踏七星 · 力克双尊！',
        hpBonus: 80,
        extraGourd: 1,
        speedBonus: 0.1,
      },
    ],
    bossCutsceneTaunt: '太虚魔尊：「区区蜀山剑修，能连破我与雷帝联手算你本事！」',
    bossEnrageLine: '星穹雷帝：「九霄劫雷降世！留在这里化为剑墟尘埃吧！」',
  },
};

export const STAGE_20_EPILOGUE: StageDialogueDef = {
  stageId: 20,
  mode: 'epilogue',
  episodeTag: '终章尾声 · 二十劫破',
  biomeLabel: '蜀山重明',
  kicker: '终章尾声 · 万里山河清朗',
  title: '第二十集终幕 — 剑圣加冕 · 山河重明',
  chapterName: '第四章 九幽绝巅',
  intel: ['二十重剑劫全破', '锁妖大阵重固', '三界共传剑圣名'],
  lines: [
    {
      speaker: '九幽剑煞 · 镇狱天尊',
      role: 'enemy',
      seal: '尊',
      text: '「竟被一名蜀山少年……一剑破尽千年煞气……这便是正道剑心么……」',
    },
    {
      speaker: '同门 · 玄影',
      role: 'ally',
      seal: '影',
      text: '「师弟你看！锁妖台上的九幽黑云散开了，蜀山群峰千道剑气都在为你共鸣长啸！」',
    },
    {
      speaker: '师尊 · 酒剑仙',
      role: 'elder',
      seal: '酒',
      text: '「哈哈哈哈，痛快！御剑乘风来，除魔天地间——臭小子，从今日起，蜀山新任剑圣之名当归于你！」',
    },
    {
      speaker: '李逍遥',
      role: 'hero',
      seal: '李',
      text: '「剑道无止境，此战不过是江湖新始。待回云来剑庐再饮一壶好酒，三界若有妖邪，我剑随召而至！」',
    },
  ],
  choices: [],
  tipText: '二十重剑劫圆满落幕，点击开启剑圣加冕战绩与赐福总览',
  confirmLabel: '剑圣加冕 · 查看战绩',
};

export const CAMP_MEDITATION_QUOTES: string[] = [
  '蒲团吐纳间，丹田真气与蜀山灵脉悄然共鸣，剑心愈发澄明。',
  '闭目回想方才出剑招路，四段斩势与御剑追影之法又精进一分。',
  '山风过竹林，一呼一吸皆合太极韵律，神清气朗。',
];

export const CAMP_TEA_QUOTES: string[] = [
  '篝火微暖，斟一杯云雾灵泉茶，尘嚣与疲惫尽随茶烟散去。',
  '炉火噼啪作响，石桌酒坛幽香飘散，正适合温养剑魄再上绝巅。',
  '一口热茶入腹，百脉通畅，待会儿提剑破阵必更从容！',
];

export function getBossCutsceneTaunt(stageId: number, bossName: string): string {
  const custom = EPISODE_STORY_SCRIPTS[stageId]?.bossCutsceneTaunt;
  if (custom) return custom;
  return `${bossName}：「蜀山剑修，亮出你的剑吧！」`;
}

export function getBossEnrageLine(stageId: number, bossName: string): string {
  const custom = EPISODE_STORY_SCRIPTS[stageId]?.bossEnrageLine;
  if (custom) return custom;
  return `${bossName}：「魔剑狂化！休想再进一步！」`;
}

export function getWineMasterCampDialogue(clearedCount: number, realmName: string): StageDialogueDef {
  let elderText: string;
  let stageLabel: string;
  if (clearedCount >= 20) {
    stageLabel = '剑圣归庐 · 把酒言欢';
    elderText = `「二十重剑劫都被你挑落马下了，如今整个蜀山谁不叫你一声少剑圣？别绷着了，过来陪师尊喝两口，秘境里还有太初仙兵等你去淘！」`;
  } else if (clearedCount >= 15) {
    stageLabel = '决战九幽前夕 · 师徒论道';
    elderText = `「深渊火狱已平，前面九幽绝巅的天劫可不是闹着玩的。你如今已有「${realmName}」修为，临战前再吐纳稳固根基、温壶好酒壮胆！」`;
  } else if (clearedCount >= 10) {
    stageLabel = '火狱行前 · 嘱托剑诀';
    elderText = `「古剑冢那群老鬼总算消停了，接下来是地火翻涌的锁妖深渊。魔兵多半带着嗜血邪功，记得多用弹反与极限闪避，莫贪刀！」`;
  } else if (clearedCount >= 5) {
    stageLabel = '剑冢风波 · 醉里传招';
    elderText = `「刚闯出十里桃源，不错，有我当年三成风采！前面剑冢满是疾风剑傀与天雷祭坛，灵石够了就先突破境界，别舍不得花！」`;
  } else {
    stageLabel = '初入江湖 · 篝火传心';
    elderText = `「来得正好！这云来剑庐是蜀山最安稳的落脚处——打累了就到篝火边品茗温酒，攒了灵石便在蒲团吐纳破境，剑术才不会生疏。」`;
  }

  return {
    stageId: 0,
    mode: 'campNpc',
    episodeTag: '云来剑庐 · 师徒闲话',
    biomeLabel: SCRIPT_BIOME_LABELS.haven_camp,
    kicker: `云来剑庐 · ${stageLabel}`,
    title: '师尊 · 酒剑仙 — 篝火温酒论剑',
    chapterName: '云来剑庐',
    intel: [`当前剑道境界：${realmName}`, `已破剑劫：${clearedCount} / 20`, '篝火温养 · 下战生效'],
    lines: [
      {
        speaker: '师尊 · 酒剑仙',
        role: 'elder',
        seal: '酒',
        text: elderText,
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: '「师尊这坛桃花酿香味飘出十丈远了，弟子正想请教下山破阵之道！」',
      },
    ],
    choices: [
      {
        id: 'camp_wine_cultivate',
        title: '请师尊指点 · 吐纳破境',
        subtitle: '打开吐纳修炼页签 · 回满气血与剑意',
        storyHint: '凝神聚气，以灵石提升剑道根基',
        heroReply: '「请师尊替弟子护法！我这就打坐吐纳，试试能否再破一重境界！」',
      },
      {
        id: 'camp_wine_drink',
        title: '陪师尊共饮 · 煮酒温养',
        subtitle: '打开篝火煮酒页签 · 畅饮一口剑意沸腾',
        storyHint: '品尝灵泉茗或桃花酿，备战下一集',
        heroReply: '「御剑江湖，岂能无酒！弟子陪师尊满饮此杯，待会儿下山斩妖更添三分胆气！」',
      },
    ],
    tipText: '择一方式与师尊互动，随时返回剑庐自由走动或出征',
    confirmLabel: '领命 · 照此修行',
  };
}

export function getXuanyingCampDialogue(nextStage: StageDef, clearedCount: number): StageDialogueDef {
  const biomeLabel = SCRIPT_BIOME_LABELS[nextStage.biome] ?? '翠竹云溪';
  const hazardTip = nextStage.hazardLabel
    ? `且此地伴随「${nextStage.hazardLabel}」，走位时千万留意脚下预警红阵。`
    : '此地灵脉尚算稳定，正适合演练四连破势与万剑归宗。';
  const allyText =
    clearedCount >= 20
      ? `「逍遥剑圣，如今各处残魔已平，但古陵与魔殿秘境仍余波未息。你随时可用木人桩试剑，或再去重温第 ${nextStage.id} 关「${nextStage.name}」！」`
      : `「师弟，下一战便是第 ${nextStage.episodeNum} 集「${nextStage.name}」（地界：${biomeLabel}）。推荐境界「${nextStage.recommendedRealm}」，${hazardTip}」`;

  return {
    stageId: nextStage.id,
    mode: 'campNpc',
    episodeTag: '云来剑庐 · 同门切磋',
    biomeLabel,
    kicker: `同门 · 玄影 — 第 ${nextStage.episodeNum} 集军情`,
    title: `玄影师兄 — 剑架旁试剑论阵`,
    chapterName: '云来剑庐',
    intel: [
      `下战目标：第 ${nextStage.id} 关 · ${nextStage.name}`,
      `地界：${biomeLabel}`,
      `推荐境界：${nextStage.recommendedRealm}`,
    ],
    lines: [
      {
        speaker: '同门 · 玄影',
        role: 'ally',
        seal: '影',
        text: allyText,
      },
      {
        speaker: '李逍遥',
        role: 'hero',
        seal: '李',
        text: `「多谢玄影师兄探报！${nextStage.name}的妖邪，我正想会会他们！」`,
      },
    ],
    choices: [
      {
        id: 'camp_ally_depart',
        title: `即刻启程 · 第 ${nextStage.episodeNum} 集`,
        subtitle: `直赴「${nextStage.name}」战前对白`,
        storyHint: '整装已毕，随玄影探明的前路直接出征',
        heroReply: `「剑已擦亮，酒已入腹！师兄保重山门，我这就前往${biomeLabel}会会第 ${nextStage.episodeNum} 集的妖众！」`,
      },
      {
        id: 'camp_ally_spar',
        title: '剑庐试招 · 木人演武',
        subtitle: '补满真气与 100% 剑意，测试连携招式',
        storyHint: '趁热打铁在木人桩前试一遍 Q→Q 追影与天剑',
        heroReply: '「不急，待我先借剑庐木人桩把 Q 追影与三印万剑归宗演练熟稔，再出征不迟！」',
      },
    ],
    tipText: '可选择直接出征下一集，或留在剑庐补满真气剑意自由演武',
    confirmLabel: '确定 · 依计而行',
  };
}
