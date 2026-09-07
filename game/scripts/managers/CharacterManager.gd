extends Node
## CharacterManager.gd - 角色管理器
##
## 职责：
## 1. 角色属性变化
## 2. 角色成长（年龄、技能）
## 3. 角色培养（季节性）
## 4. 角色死亡判定
## 5. 角色出仕/退隐
##
## 参考文档：docs/02-详细GDD.md 第 A1 节

# 角色成长配置
const AGE_STAGES = {
	"infant": {"range": [0, 6], "growth_rate": 0.5, "description": "幼年"},
	"child": {"range": [7, 13], "growth_rate": 0.8, "description": "少年"},
	"youth": {"range": [14, 24], "growth_rate": 1.5, "description": "青年"},
	"prime": {"range": [25, 45], "growth_rate": 1.0, "description": "壮年"},
	"elder": {"range": [46, 65], "growth_rate": 0.4, "description": "中老年"},
	"old": {"range": [66, 200], "growth_rate": 0.1, "description": "老年"}
}

# 培养方向
enum CultivationPath { OFFICIAL, GENERAL, ARTIST, SCHOLAR, HERMIT }

const PATH_NAMES = {
	CultivationPath.OFFICIAL: "名臣",
	CultivationPath.GENERAL: "统帅",
	CultivationPath.ARTIST: "艺术家",
	CultivationPath.SCHOLAR: "名士",
	CultivationPath.HERMIT: "隐逸"
}

const PATH_STAT_WEIGHTS = {
	CultivationPath.OFFICIAL: {"intelligence": 0.2, "governance": 0.4, "virtue": 0.2, "charm": 0.2},
	CultivationPath.GENERAL: {"martial": 0.4, "intelligence": 0.2, "governance": 0.2, "virtue": 0.2},
	CultivationPath.ARTIST: {"charm": 0.3, "intelligence": 0.2, "virtue": 0.2, "calligraphy": 0.3},
	CultivationPath.SCHOLAR: {"intelligence": 0.4, "charm": 0.2, "philosophy": 0.4},
	CultivationPath.HERMIT: {"virtue": 0.3, "intelligence": 0.3, "philosophy": 0.4}
}

# 信号
signal character_aged(char_id: String, new_age: int)
signal character_died(char_id: String, cause: String)
signal character_cultivated(char_id: String, path: int, stat_gains: Dictionary)
signal character_official_changed(char_id: String, old_office: String, new_office: String)


func _ready() -> void:
	pass


func age_all_characters() -> void:
	"""所有角色年龄+1（每年年初调用）"""
	for char_id in GameManager.runtime_characters:
		var char_data = GameManager.runtime_characters[char_id]
		if char_data.get("is_alive", false):
			char_data["current_age"] = char_data.get("current_age", 0) + 1
			character_aged.emit(char_id, char_data["current_age"])
			_check_death(char_id)


func _check_death(char_id: String) -> void:
	"""检查角色是否应该死亡"""
	var char_data = GameManager.runtime_characters[char_id]
	if not char_data.get("is_alive", false):
		return

	var template = GameManager.characters_data.get("characters", {}).get(char_id, {})
	if template.is_empty():
		return

	var natural_death_age = template.get("death_year", 999) - template.get("birth_year", 300)
	var current_age = char_data.get("current_age", 0)

	if current_age >= natural_death_age:
		char_data["is_alive"] = false
		character_died.emit(char_id, "natural")
		print("[CharacterManager] 角色 %s 自然死亡（年龄 %d）" % [char_data.get("name", char_id), current_age])


func cultivate_character(char_id: String, path: int, duration_months: int = 3) -> Dictionary:
	"""培养角色
	参数：
	- char_id: 角色ID
	- path: 培养方向（枚举）
	- duration_months: 培养时长（月）
	返回：本次培养的属性提升
	"""
	var char_data = GameManager.runtime_characters.get(char_id, {})
	if char_data.is_empty() or not char_data.get("is_alive", false):
		return {}

	var weights = PATH_STAT_WEIGHTS.get(path, {})
	var stat_gains = {}

	for stat in weights:
		var base_gain = weights[stat] * duration_months * randf_range(0.8, 1.2)
		var old_value = char_data.get("stats", {}).get(stat, 0)
		var new_value = min(100, old_value + base_gain)
		stat_gains[stat] = new_value - old_value
		if "stats" not in char_data:
			char_data["stats"] = {}
		char_data["stats"][stat] = new_value

	# 技能成长
	if "skills" not in char_data:
		char_data["skills"] = {}

	# 标记培养方向
	char_data["cultivation_path"] = path

	character_cultivated.emit(char_id, path, stat_gains)
	print("[CharacterManager] 角色 %s 培养方向 %s，时长 %d 月，属性提升 %s" % [
		char_data.get("name", char_id), PATH_NAMES.get(path, "?"), duration_months, stat_gains
	])
	return stat_gains


func get_age_stage(age: int) -> String:
	"""获取年龄阶段"""
	for stage in AGE_STAGES:
		var range = AGE_STAGES[stage]["range"]
		if age >= range[0] and age <= range[1]:
			return stage
	return "old"


def change_official_position(char_id: String, new_office: String) -> void:
	"""改变官职"""
	var char_data = GameManager.runtime_characters.get(char_id, {})
	if char_data.is_empty():
		return

	var old_office = char_data.get("current_office", "")
	char_data["current_office"] = new_office
	character_official_changed.emit(char_id, old_office, new_office)


func get_alive_characters_by_family(family_id: String) -> Array:
	"""获取家族中所有存活的角色"""
	var result = []
	for char_id in GameManager.runtime_characters:
		var char_data = GameManager.runtime_characters[char_id]
		if char_data.get("family_id", "") == family_id and char_data.get("is_alive", false):
			result.append(char_data)
	return result


func calculate_character_overall_power(char_id: String) -> float:
	"""计算角色综合实力（用于AI决策和联姻匹配）"""
	var char_data = GameManager.runtime_characters.get(char_id, {})
	if char_data.is_empty():
		return 0.0

	var stats = char_data.get("stats", {})
	var total = 0.0
	for stat in stats:
		total += stats[stat]
	total = total / max(1, stats.size())

	# 品级加成
	var family = GameManager.runtime_families.get(char_data.get("family_id", ""), {})
	var rank = family.get("rank", 5)
	var rank_bonus = (9 - rank) * 2.0  # 品级1-9，1品最优

	# 功业加成
	var merit_bonus = 0.0
	var merit_level = family.get("current_merit_level", "none")
	if merit_level == "first_class":
		merit_bonus = 15.0
	elif merit_level == "second_class":
		merit_bonus = 8.0
	elif merit_level == "third_class":
		merit_bonus = 3.0

	return total + rank_bonus + merit_bonus


func age_characters_on_year_advance() -> void:
	"""每年年初让所有角色年龄+1（由 TimeManager 调用）"""
	age_all_characters()