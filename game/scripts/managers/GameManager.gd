extends Node
## GameManager.gd - 全局游戏管理器（自动加载单例）
##
## 职责：
## 1. 管理游戏的全局状态（玩家家族、当前时代、存档槽位）
## 2. 协调各个子管理器
## 3. 提供全局事件总线
##
## 信号：
## - game_started: 游戏开始
## - game_loaded: 读档完成
## - game_saved: 存档完成
## - turn_advanced: 回合推进
## - year_advanced: 年份推进

# 当前游戏状态
var current_year: int = 317  # 当前年份（东晋起始年）
var current_month: int = 1   # 当前月份
var current_season: String = "spring"
var player_family_id: String = ""  # 玩家家族ID
var current_save_slot: int = -1

# 数据缓存
var families_data: Dictionary = {}
var characters_data: Dictionary = {}
var events_data: Dictionary = {}
var estates_data: Dictionary = {}
var game_config: Dictionary = {}

# 路径常量
const DATA_PATH_FAMILIES = "res://data/families/families.json"
const DATA_PATH_CHARACTERS = "res://data/characters/characters.json"
const DATA_PATH_EVENTS = "res://data/events/events.json"
const DATA_PATH_ESTATES = "res://data/estates/estates.json"
const DATA_PATH_CONFIG = "res://data/configs/game_config.json"

# 角色运行时数据（区别于模板数据）
var runtime_characters: Dictionary = {}  # 角色ID -> 角色实例数据
var runtime_families: Dictionary = {}    # 家族ID -> 家族实例数据

# 全局事件总线
signal game_started(family_id: String)
signal game_loaded(save_slot: int)
signal game_saved(save_slot: int)
signal turn_advanced(new_season: String, new_month: int)
signal year_advanced(new_year: int)
signal event_triggered(event_id: String)
signal character_changed(character_id: String, stat_name: String, old_value: float, new_value: float)
signal family_prestige_changed(family_id: String, old_value: int, new_value: int)
signal family_rank_changed(family_id: String, old_rank: int, new_rank: int)

# 调试标志
var debug_mode: bool = false


func _ready() -> void:
	"""初始化游戏管理器，加载所有数据"""
	print("[GameManager] _ready() - 加载数据...")
	_load_all_data()
	print("[GameManager] 数据加载完成")
	if debug_mode:
		print("[GameManager] 调试模式已开启")


func _load_all_data() -> void:
	"""加载所有 JSON 数据文件"""
	families_data = _load_json(DATA_PATH_FAMILIES)
	characters_data = _load_json(DATA_PATH_CHARACTERS)
	events_data = _load_json(DATA_PATH_EVENTS)
	estates_data = _load_json(DATA_PATH_ESTATES)
	game_config = _load_json(DATA_PATH_CONFIG)


func _load_json(path: String) -> Dictionary:
	"""加载 JSON 文件并返回字典"""
	if not FileAccess.file_exists(path):
		push_error("[GameManager] 文件不存在: %s" % path)
		return {}

	var file = FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("[GameManager] 无法打开文件: %s" % path)
		return {}

	var content = file.get_as_text()
	file.close()

	var json = JSON.new()
	var parse_result = json.parse(content)
	if parse_result != OK:
		push_error("[GameManager] JSON 解析失败 %s: %s" % [path, json.get_error_message()])
		return {}

	var data = json.data
	if typeof(data) != TYPE_DICTIONARY:
		push_error("[GameManager] JSON 顶层不是字典: %s" % path)
		return {}

	return data


func start_new_game(family_id: String) -> void:
	"""开始新游戏，初始化玩家家族数据"""
	print("[GameManager] 开始新游戏，家族: %s" % family_id)

	if family_id not in families_data.get("families", {}):
		push_error("[GameManager] 家族不存在: %s" % family_id)
		return

	player_family_id = family_id
	current_year = 317  # 东晋起始年
	current_month = 1
	current_season = "spring"

	# 初始化运行时数据
	_initialize_runtime_data()

	game_started.emit(family_id)
	print("[GameManager] 新游戏初始化完成")


func _initialize_runtime_data() -> void:
	"""基于模板数据初始化运行时数据"""
	runtime_families.clear()
	runtime_characters.clear()

	# 初始化玩家家族
	var family_template = families_data.get("families", {}).get(player_family_id, {})
	if family_template.is_empty():
		return

	var family_runtime = family_template.duplicate(true)
	family_runtime["wealth"] = family_template.get("wealth", 1000)
	family_runtime["prestige"] = family_template.get("prestige", 50)
	family_runtime["rank"] = family_template.get("rank", 5)
	family_runtime["merits"] = []  # 功业列表
	family_runtime["current_merit_level"] = "none"  # 当前功业等级
	runtime_families[player_family_id] = family_runtime

	# 初始化家族成员
	var starting_characters = family_template.get("starting_characters", [])
	for char_id in starting_characters:
		var char_template = characters_data.get("characters", {}).get(char_id, {})
		if not char_template.is_empty():
			var char_runtime = char_template.duplicate(true)
			char_runtime["current_age"] = current_year - char_template.get("birth_year", 300)
			char_runtime["is_alive"] = char_runtime["current_age"] < (char_template.get("death_year", 400) - char_template.get("birth_year", 300))
			char_runtime["relationship_ids"] = char_template.get("relationship_ids", [])
			runtime_characters[char_id] = char_runtime

	# 初始化田庄
	var family_estates = estates_data.get("starting_estates", {}).get(player_family_id, [])
	for estate in family_estates:
		# 这里可以通过 EstateManager 管理
		pass


func advance_time(months: int = 1) -> void:
	"""推进时间（月）"""
	current_month += months
	while current_month > 12:
		current_month -= 12
		current_year += 1
		year_advanced.emit(current_year)

	current_season = _get_season(current_month)
	turn_advanced.emit(current_season, current_month)


func _get_season(month: int) -> String:
	"""根据月份返回季节"""
	if month >= 1 and month <= 3:
		return "spring"
	elif month >= 4 and month <= 6:
		return "summer"
	elif month >= 7 and month <= 9:
		return "autumn"
	else:
		return "winter"


func get_player_family() -> Dictionary:
	"""获取玩家家族运行时数据"""
	return runtime_families.get(player_family_id, {})


func get_character(char_id: String) -> Dictionary:
	"""获取角色运行时数据"""
	return runtime_characters.get(char_id, {})


func get_all_living_characters() -> Array:
	"""获取所有存活的角色"""
	var living = []
	for char_id in runtime_characters:
		var char_data = runtime_characters[char_id]
		if char_data.get("is_alive", false):
			living.append(char_data)
	return living


func get_family_characters(family_id: String) -> Array:
	"""获取指定家族的所有角色"""
	var chars = []
	for char_id in runtime_characters:
		var char_data = runtime_characters[char_id]
		if char_data.get("family_id", "") == family_id:
			chars.append(char_data)
	return chars


func modify_family_prestige(family_id: String, delta: int) -> void:
	"""修改家族声望"""
	if family_id not in runtime_families:
		return
	var old_value = runtime_families[family_id].get("prestige", 0)
	var new_value = old_value + delta
	runtime_families[family_id]["prestige"] = new_value
	family_prestige_changed.emit(family_id, old_value, new_value)


func modify_family_wealth(family_id: String, delta: int) -> void:
	"""修改家族财富"""
	if family_id not in runtime_families:
		return
	runtime_families[family_id]["wealth"] = runtime_families[family_id].get("wealth", 0) + delta


func modify_family_rank(family_id: String, new_rank: int) -> void:
	"""修改家族品级"""
	if family_id not in runtime_families:
		return
	var old_rank = runtime_families[family_id].get("rank", 5)
	if old_rank == new_rank:
		return
	runtime_families[family_id]["rank"] = new_rank
	family_rank_changed.emit(family_id, old_rank, new_rank)


func get_year_month_season_string() -> String:
	"""获取当前时间字符串"""
	var month_names = ["正月", "二月", "三月", "四月", "五月", "六月",
					   "七月", "八月", "九月", "十月", "十一月", "十二月"]
	var month_name = month_names[current_month - 1] if current_month >= 1 and current_month <= 12 else "?"
	var season_names = {"spring": "春", "summer": "夏", "autumn": "秋", "winter": "冬"}
	var season_name = season_names.get(current_season, "?")
	return "%d年 %s（%s）" % [current_year, month_name, season_name]