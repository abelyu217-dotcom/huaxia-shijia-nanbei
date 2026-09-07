extends Node
## EventManager.gd - 事件管理器
##
## 职责：
## 1. 检查事件触发条件
## 2. 显示事件对话框
## 3. 处理玩家选择
## 4. 应用事件后果
##
## 参考文档：docs/02-详细GDD.md 第 C3 节（淝水之战完整事件设计）

# 事件队列
var pending_events: Array = []
var active_event: Dictionary = {}  # 当前显示的事件
var triggered_event_ids: Array = []  # 已触发的事件ID（避免重复触发）

# 信号
signal event_triggered(event_id: String, event_data: Dictionary)
signal event_choice_made(event_id: String, choice_id: String)
signal event_completed(event_id: String)
signal show_event_dialog(event_data: Dictionary)
signal hide_event_dialog()


func _ready() -> void:
	pass


func check_triggers() -> void:
	"""检查所有事件触发条件（在时间推进时调用）"""
	for event_id in GameManager.events_data.get("events", {}):
		var event = GameManager.events_data["events"][event_id]
		if event_id in triggered_event_ids:
			continue
		if not event.get("is_repeatable", true):
			if event_id in triggered_event_ids:
				continue

		if _check_condition(event.get("trigger_condition", {})):
			queue_event(event_id, event)


func _check_condition(condition: Dictionary) -> bool:
	"""检查单个事件的触发条件"""
	if condition.is_empty():
		return true

	# 年份条件
	if "year_gte" in condition:
		if GameManager.current_year < condition["year_gte"]:
			return false
	if "year_lt" in condition:
		if GameManager.current_year >= condition["year_lt"]:
			return false
	if "year_lte" in condition:
		if GameManager.current_year > condition["year_lte"]:
			return false

	# 家族条件
	if "family_id" in condition:
		if GameManager.player_family_id != condition["family_id"]:
			return false

	# 角色条件
	if "has_character" in condition:
		var char_id = condition["has_character"]
		var char_data = GameManager.runtime_characters.get(char_id, {})
		if not char_data.get("is_alive", false):
			return false

	return true


func queue_event(event_id: String, event_data: Dictionary) -> void:
	"""将事件加入待触发队列"""
	if event_id in pending_events:
		return
	pending_events.append(event_id)
	if GameManager.debug_mode:
		print("[EventManager] 事件加入队列: %s - %s" % [event_id, event_data.get("title", "")])


func process_next_event() -> bool:
	"""处理下一个待触发事件，返回是否成功处理"""
	if pending_events.is_empty():
		return false

	var event_id = pending_events[0]
	var event_data = GameManager.events_data.get("events", {}).get(event_id, {})

	active_event = event_data
	active_event["id"] = event_id

	show_event_dialog.emit(active_event)
	event_triggered.emit(event_id, active_event)

	# 标记为已触发
	if not event_data.get("is_repeatable", true):
		triggered_event_ids.append(event_id)

	pending_events.remove_at(0)
	return true


func make_choice(choice_id: String) -> void:
	"""玩家做出选择"""
	if active_event.is_empty():
		return

	var event_id = active_event.get("id", "")
	var choices = active_event.get("choices", [])

	for choice in choices:
		if choice.get("id", "") == choice_id:
			_apply_choice_consequences(choice)
			event_choice_made.emit(event_id, choice_id)
			active_event = {}
			event_completed.emit(event_id)
			hide_event_dialog.emit()
			if GameManager.debug_mode:
				print("[EventManager] 玩家选择: %s -> %s" % [event_id, choice_id])
			return


func _apply_choice_consequences(choice: Dictionary) -> void:
	"""应用选择的后果"""
	var consequences = choice.get("stat_effects", {})
	var player_family_id = GameManager.player_family_id

	if "family_prestige" in consequences:
		GameManager.modify_family_prestige(player_family_id, int(consequences["family_prestige"]))

	if "family_wealth" in consequences:
		GameManager.modify_family_wealth(player_family_id, int(consequences["family_wealth"]))

	if "family_rank_change" in consequences:
		var current_rank = GameManager.runtime_families.get(player_family_id, {}).get("rank", 5)
		var new_rank = current_rank + int(consequences["family_rank_change"])
		new_rank = clamp(new_rank, 1, 9)
		GameManager.modify_family_rank(player_family_id, new_rank)

	if "family_merit" in consequences:
		FamilyManager.add_family_merit(player_family_id, consequences["family_merit"], active_event.get("title", ""))

	if "family_culture" in consequences:
		# 文化声望
		var family = GameManager.runtime_families.get(player_family_id, {})
		if family:
			family["culture"] = family.get("culture", 0) + int(consequences["family_culture"])

	if "family_military_strength" in consequences:
		# 军事力量
		var family = GameManager.runtime_families.get(player_family_id, {})
		if family:
			family["military_strength"] = family.get("military_strength", 0) + int(consequences["family_military_strength"])

	# 角色属性变化
	for key in consequences:
		if key.begins_with("character_"):
			var stat_name = key.substr(11)  # "character_".length() = 10
			# TODO: 应用到对应角色


func get_event_count() -> int:
	"""获取已触发事件数"""
	return triggered_event_ids.size()