import {profileFor} from './memory-profiles.js';
import {ExtractionError} from './extraction-contract.js';
const fail=m=>{throw new ExtractionError('INVALID_EXTRACTION',m);};
export function validateChatRequest(r){if(r?.version!==1||!profileFor(r.profileId)||typeof r.question!=='string'||!r.question.trim()||r.question.length>2000||!Number.isFinite(r.now))fail('问题、记忆档案或时间无效');return r;}
export function validateChatAnswer(answer,profileId,memories=profileFor(profileId)?.memories){const p=profileFor(profileId);if(!p||!Array.isArray(answer?.sentences)||!answer.sentences.length||answer.sentences.length>6)fail('回答须为1至6条句子');const ids=new Set(memories.map(m=>m.id));for(const s of answer.sentences){if(typeof s.text!=='string'||!s.text.trim()||s.text.length>600||!Array.isArray(s.memoryIds)||s.memoryIds.length>4||s.memoryIds.some(id=>!ids.has(id))||new Set(s.memoryIds).size!==s.memoryIds.length)fail('回答或记忆引用无效，不能引用其他档案');}return answer;}
