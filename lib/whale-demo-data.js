// 虚构演示数据源：与 E:\Tianchi\Whale全新聊天记录.json 对应，规则引擎只消费既有 seeds 结构。
import chatData from './whale-chat-demo.json' with { type: 'json' };

export const demoDataVersion = chatData.version;
export const heroChat = chatData.heroChat;
export const recommendedHeroBackground = chatData.recommendedHeroBackground;
export const backgrounds = chatData.backgrounds;
export const scenarioSeeds = chatData.scenarioSeeds;
export const groupMemoryPreset = chatData.groupMemoryPreset;
export const demoBase = chatData.demoBase;
export const demoBaseMs = Date.parse(`${demoBase.replace(' ', 'T')}:00+08:00`);

const details = {
  grade: {
    tag: '年级通知', mark: '级',
    samples: ['青年大学习11月22日18:00前完成，完成截图发到本群。', '更正：安全教育改到11月21日上午10:00，地点：学生活动中心报告厅。', '原定周五的心理讲座取消，时间另行通知。'],
  },
  course: {
    tag: '学习事务', mark: '课',
    samples: ['开题报告11月24日18:00前提交到课程平台，文件命名为：小组编号-开题报告。', '开题报告延期到11月25日18:00提交。', '我完成了小组分工表初稿。'],
  },
  club: {
    tag: '活动安排', mark: '社',
    samples: ['城市漫步11月24日下午3点集合，地点：东门公交站。', '城市漫步改到11月25日下午3点集合，地点：东门公交站。', '取消志愿讲解。'],
  },
  project: {
    tag: '团队协作', mark: '项',
    samples: ['我负责测试记录，明天18:00前整理完成。', '产品说明延期到12月2日18:00提交。', '原型联调11月21日15:00开始，地点：线上会议室。'],
  },
  lab: {
    tag: '实验通知', mark: '实',
    samples: ['设备培训11月30日14:00集合，地点：实验楼A203。', '实验记录12月3日前提交，附原始数据。'],
  },
  home: {
    tag: '生活事务', mark: '生',
    samples: ['饮水机报修11月24日前完成。', '周六晚上一起吃饭吗？我不吃辣，优先选清淡的。', '回宿舍把客厅灯打开。'],
  },
};

export const scenarios = backgrounds.map(background => {
  const seed = scenarioSeeds[background.id];
  return {
    id: background.id,
    name: seed.name,
    tag: details[background.id].tag,
    mark: details[background.id].mark,
    description: seed.description,
    focus: background.focus,
    samples: details[background.id].samples,
    seeds: seed.messages,
  };
});

// 作者键保持规则引擎现有结构；只有 owner/admin 能发布待办。
export const memberDirectory = {
  grade: [{ name: '辅导员', role: 'owner' }, { name: '学习委员', role: 'admin' }, { name: '同学', role: 'member' }, { name: '我', role: 'admin' }],
  course: [{ name: '老师', role: 'owner' }, { name: '助教', role: 'admin' }, { name: '成员', role: 'member' }, { name: '我', role: 'admin' }],
  club: [{ name: '社长', role: 'owner' }, { name: '组织部', role: 'admin' }, { name: '成员', role: 'member' }, { name: '我', role: 'admin' }],
  project: [{ name: '负责人', role: 'owner' }, { name: '我', role: 'admin' }, { name: '成员', role: 'member' }],
  lab: [{ name: '实验员', role: 'owner' }, { name: '师兄', role: 'member' }, { name: '我', role: 'admin' }],
  home: [{ name: '楼长', role: 'owner' }, { name: '室友', role: 'member' }, { name: '我', role: 'admin' }],
};
