// Fictional contest fixtures. Separate from the user's curated browser memories.
export const memoryProfiles=[
 {id:'exam',name:'期末冲刺',description:'数字电路复习，有明确考试和短时学习偏好。',memories:[
  {id:'exam-subject',kind:'fact',summary:'正在复习数字集成电路，重点是CMOS反相器和组合逻辑。'},
  {id:'exam-date',kind:'fact',summary:'11月29日参加数字集成电路考试，近期优先复习。'},
  {id:'exam-style',kind:'preference',summary:'喜欢用波形图和具体例题理解概念，每学习25分钟休息5分钟。'},
  {id:'exam-place',kind:'preference',summary:'偏好在图书馆安静区域学习，复习时关闭非必要消息。'}]},
 {id:'project',name:'项目交付',description:'正在准备Whale演示，需要先打通关键功能。',memories:[
  {id:'project-goal',kind:'fact',summary:'正在制作Whale群通知整理演示，11月30日前准备展示。'},
  {id:'project-blocker',kind:'episode',summary:'上次联调发现：AI提取接口尚未连通真实模型，不能把模拟结果当成实测。'},
  {id:'project-style',kind:'preference',summary:'喜欢先做一个能运行的小版本，再通过实际测试迭代。'},
  {id:'project-next',kind:'fact',summary:'下一步先验证真实通知提取，再检查原文引用和失败重试。'}]},
 {id:'daily',name:'日常学习',description:'没有紧急交付，希望保持轻量且持续的学习。',memories:[
  {id:'daily-goal',kind:'fact',summary:'最近希望每天学习一点英语，没有近期考试任务。'},
  {id:'daily-energy',kind:'episode',summary:'最近连续熬夜，今天精力一般，不适合长时间高强度安排。'},
  {id:'daily-style',kind:'preference',summary:'偏好短音频和跟读练习，每次15分钟更容易坚持。'},
  {id:'daily-place',kind:'preference',summary:'喜欢在家学习，开始前先收拾桌面，手机调为免打扰。'}]}
];
// Explicit, reviewable fictional preferences; never infer an actuator setting
// from arbitrary model prose or a group member's message.
const environments={
 exam:{temp:24,summary:'在宿舍复习时，习惯开灯、空调设为24℃、拉上窗帘，音箱保持安静。'},
 project:{temp:25,summary:'在宿舍做项目时，习惯开灯、空调设为25℃、拉开窗帘，音箱保持安静。'},
 daily:{temp:26,summary:'在家轻量学习时，习惯开灯、空调设为26℃、拉开窗帘，音箱保持安静。'}
};
for(const p of memoryProfiles){const e=environments[p.id];p.memories.push({id:p.id+'-environment',kind:'preference',summary:e.summary,settings:[
 {deviceId:'living_light',capability:'on_off',args:{on:true}},
 {deviceId:'bedroom_ac',capability:'on_off',args:{on:true}},
 {deviceId:'bedroom_ac',capability:'set_temperature',args:{temp:e.temp}},
 {deviceId:'curtain',capability:'open_close',args:{open:p.id!=='exam'}},
 {deviceId:'speaker',capability:'play',args:{playing:false}}
]});}
export function profileFor(id){return memoryProfiles.find(p=>p.id===id);}
export function simulatedMemoryAnswer(profileId){const p=profileFor(profileId);if(!p)throw new Error('记忆档案不存在');return{version:1,engine:{type:'simulation',provider:'固定模板'},extraction:{sentences:p.memories.map(m=>({text:m.summary,memoryIds:[m.id]}))}};}
