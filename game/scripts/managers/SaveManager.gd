extends Node
## SaveManager.gd - 存档管理器
##
## 职责：
## 1. 保存游戏状态到 JSON 文件
## 2. 加载存档
## 3. 管理多个存档槽位
## 4. 存档版本兼容性
##
## 参考文档：docs/05-技术架构文档.md 第 8 节

# 存档槽位
const MAX_SAVE_SLOTS = 5
const SAVE_VERSION = "1.0.0"
const SAVE_DIR = "user://saves/"

# 信号
signal save_completed(slot: int, success: bool)
signal load_completed(slot: int, success: bool)
signal save_slot_deleted(slot: int)


func _ready() -> void:
	# 确保存档目录存在
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(SAVE_DIR))


func save_game(slot: int) -> bool:
	"""保存游戏到指定槽位"""
	if slot < 0 or slot >= MAX_SAVE_SLOTS:
		push_error("[SaveManager] 无效的存档槽位: %d" % slot)
		save_completed.emit(slot, false)
		return false

	var save_data = _build_save_data()
	var file_path = SAVE_DIR + "save_%d.json" % slot

	var file = FileAccess.open(file_path, FileAccess.WRITE)
	if file == null:
		push_error("[SaveManager] 无法打开存档文件: %s" % file_path)
		save_completed.emit(slot, false)
		return false

	var json = JSON.new()
	var json_string = json.stringify(save_data, "  ")
	file.store_string(json_string)
	file.close()

	save_completed.emit(slot, true)
	GameManager.game_saved.emit(slot)
	print("[SaveManager] 存档成功：槽位 %d" % slot)
	return true


func _build_save_data() -> Dictionary:
	"""构建完整的存档数据"""
	return {
		"version": SAVE_VERSION,
		"saved_at": Time.get_datetime_dict_from_system(),
		"current_year": GameManager.current_year,
		"current_month": GameManager.current_month,
		"current_season": GameManager.current_season,
		"player_family_id": GameManager.player_family_id,
		"runtime_families": GameManager.runtime_families,
		"runtime_characters": GameManager.runtime_characters,
		"relations": RelationshipManager.relations,
		"triggered_events": EventManager.triggered_event_ids
	}


func load_game(slot: int) -> bool:
	"""加载指定槽位的存档"""
	if slot < 0 or slot >= MAX_SAVE_SLOTS:
		push_error("[SaveManager] 无效的存档槽位: %d" % slot)
		load_completed.emit(slot, false)
		return false

	var file_path = SAVE_DIR + "save_%d.json" % slot
	if not FileAccess.file_exists(file_path):
		push_error("[SaveManager] 存档不存在: %s" % file_path)
		load_completed.emit(slot, false)
		return false

	var file = FileAccess.open(file_path, FileAccess.READ)
	if file == null:
		push_error("[SaveManager] 无法打开存档文件: %s" % file_path)
		load_completed.emit(slot, false)
		return false

	var content = file.get_as_text()
	file.close()

	var json = JSON.new()
	var parse_result = json.parse(content)
	if parse_result != OK:
		push_error("[SaveManager] 存档 JSON 解析失败: %s" % json.get_error_message())
		load_completed.emit(slot, false)
		return false

	var data = json.data
	if typeof(data) != TYPE_DICTIONARY:
		push_error("[SaveManager] 存档格式错误")
		load_completed.emit(slot, false)
		return false

	# 版本检查
	var save_version = data.get("version", "0.0.0")
	if not _is_compatible_version(save_version):
		push_warning("[SaveManager] 存档版本不兼容: %s -> %s" % [save_version, SAVE_VERSION])

	# 恢复游戏状态
	GameManager.current_year = data.get("current_year", 317)
	GameManager.current_month = data.get("current_month", 1)
	GameManager.current_season = data.get("current_season", "spring")
	GameManager.player_family_id = data.get("player_family_id", "")
	GameManager.runtime_families = data.get("runtime_families", {})
	GameManager.runtime_characters = data.get("runtime_characters", {})
	RelationshipManager.relations = data.get("relations", {})
	EventManager.triggered_event_ids = data.get("triggered_events", [])

	GameManager.current_save_slot = slot
	load_completed.emit(slot, true)
	GameManager.game_loaded.emit(slot)
	print("[SaveManager] 读档成功：槽位 %d" % slot)
	return true


func _is_compatible_version(version: String) -> bool:
	"""检查版本兼容性"""
	var parts = version.split(".")
	if parts.size() < 3:
		return false
	return parts[0] == SAVE_VERSION.split(".")[0]


func has_save(slot: int) -> bool:
	"""检查指定槽位是否有存档"""
	var file_path = SAVE_DIR + "save_%d.json" % slot
	return FileAccess.file_exists(file_path)


func delete_save(slot: int) -> bool:
	"""删除指定槽位的存档"""
	var file_path = SAVE_DIR + "save_%d.json" % slot
	if not FileAccess.file_exists(file_path):
		return false

	var err = DirAccess.remove_absolute(ProjectSettings.globalize_path(file_path))
	if err == OK:
		save_slot_deleted.emit(slot)
		print("[SaveManager] 删除存档：槽位 %d" % slot)
		return true
	return false


func get_save_info(slot: int) -> Dictionary:
	"""获取存档信息（用于显示存档列表）"""
	var file_path = SAVE_DIR + "save_%d.json" % slot
	if not FileAccess.file_exists(file_path):
		return {}

	var file = FileAccess.open(file_path, FileAccess.READ)
	if file == null:
		return {}

	var content = file.get_as_text()
	file.close()

	var json = JSON.new()
	var parse_result = json.parse(content)
	if parse_result != OK:
		return {}

	var data = json.data
	return {
		"slot": slot,
		"version": data.get("version", "?"),
		"saved_at": data.get("saved_at", {}),
		"current_year": data.get("current_year", 0),
		"player_family_id": data.get("player_family_id", ""),
		"player_family_name": GameManager.families_data.get("families", {}).get(data.get("player_family_id", ""), {}).get("name", "?")
	}