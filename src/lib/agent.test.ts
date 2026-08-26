import assert from 'node:assert/strict'
import test from 'node:test'
import { agentStatusLabel, agentToolLabel } from './agent'

test('uses a specific spoken status for each tool', () => {
  assert.equal(agentStatusLabel('tool', 'remember'), 'دارم می‌ذارم تو حافظه…')
  assert.equal(agentStatusLabel('tool', 'recall'), 'دارم حافظه رو می‌خونم…')
  assert.equal(agentStatusLabel('tool', 'search_chats'), 'دارم گفتگوهای قبلی رو می‌گردم…')
  assert.equal(agentStatusLabel('tool', 'read_chat'), 'دارم گفتگوی قبلی رو مرور می‌کنم…')
  assert.equal(agentStatusLabel('tool', 'update_user_profile'), 'دارم پروفایلت رو عوض می‌کنم…')
  assert.equal(agentStatusLabel('tool', 'end_conversation'), 'دارم گفتگو رو می‌بندم…')
  assert.equal(agentStatusLabel('tool', 'read_file'), 'دارم فایل رو می‌خونم…')
  assert.equal(agentStatusLabel('tool', 'write_file'), 'دارم فایل رو آماده می‌کنم…')
  assert.equal(agentStatusLabel('tool', 'fetch_webpage'), 'دارم صفحهٔ وب رو می‌خونم…')
  assert.equal(agentStatusLabel('tool', 'search_web'), 'دارم وب رو می‌گردم…')
  assert.equal(agentStatusLabel('tool', 'search_files'), 'دارم دنبال فایل می‌گردم…')
  assert.equal(agentStatusLabel('tool', 'run_command'), 'دارم یه دستور اجرا می‌کنم…')
  assert.equal(agentStatusLabel('tool', 'create_task'), 'دارم یادآوری رو ذخیره می‌کنم…')
  assert.equal(agentStatusLabel('tool', 'list_tasks'), 'دارم یادآوری‌ها رو می‌خونم…')
  assert.equal(agentStatusLabel('tool', 'unknown'), 'یک لحظه…')
})

test('falls back to thinking copy when no tool is running', () => {
  assert.equal(agentStatusLabel('thinking'), 'دارم فکر می‌کنم…')
  assert.equal(agentStatusLabel('confirm'), 'تأیید یا رد کن')
  assert.equal(agentStatusLabel('error'), '…')
})

test('uses short labels for tool activity UI', () => {
  assert.equal(agentToolLabel('read_file'), 'خواندن فایل')
  assert.equal(agentToolLabel('open_app'), 'بازکردن')
  assert.equal(agentToolLabel('search_chats'), 'جستجوی گفتگوها')
  assert.equal(agentToolLabel('search_web'), 'جستجوی وب')
  assert.equal(agentToolLabel('create_task'), 'ثبت یادآوری')
  assert.equal(agentToolLabel('unknown'), 'انجام کار')
})
