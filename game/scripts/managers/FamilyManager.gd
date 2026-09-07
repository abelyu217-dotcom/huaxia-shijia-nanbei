extends Node
## FamilyManager.gd - 家族管理器
##
## 职责：
## 1. 家族品级升降判定
## 2. 联姻匹配规则
## 3. 家族文化传承（家学）
## 4. 家族功业记录
## 5. 家族会议（决策）
##
## 参考文档：docs/02-详细GDD.md 第 A3 节

# 家族品级阈值
const RANK_THRESHOLDS = {
	1: {"prestige_min": 80, "members_min": 5, "merit_required": true},
	2: {"prestige_min": 60, "members_min": 4, "merit_required": false},
	3: {"prestige_min": 40, "members_min": 3, "merit_required": false},
	4: {"prestige_min": 25, "members_min": 3, "merit_required": false},
	5: {"prestige_min": 15, "members_min": 2, "merit_required": false},
	6: {"prestige_min": 8, " "members_min": 1, "merit_required": false},
	7: {"prestige_min": 3, "members_min": 1, "merit_required": false},
}

# 家族功业等级
enum MeritLevel { NONE, THIRD, SECOND, FIRST }
const MERIT_NAMES = {
	MeritLevel.NONE: "无",
	MeritLevel.THIRD: "三等功业",
	MeritLevel.SECOND: "二等功业",
	MeritLevel.FIRST: "一等功业"
}

# 家族会议主题
var meeting_topics: Array = []

# 信号
signal family_meeting_called(topic: String)
signal family_meeting_resolved(topic: String, decision: String)
signal family_rank_evaluated(family_id: String, suggested_rank: int)
signal marriage_proposed(family_a_id: String, family_b_id: String, char_a_id: String, char_b_id: String)


func _ready() -> void:
	pass


func evaluate_family_rank(family_id: String) -> int:
	"""评估家族当前应有的品级（基于声望、成员数、功业）"""
	var family = GameManager.runtime_families.get(family_id, {})
	if family.is_empty():
		return 9

	var prestige = family.get("prestige", 0)
	var members_count = GameManager.get_family_characters(family_id).size()
	var merit_level = family.get("current_merit_level", "none")

	# 计算建议品级（数字越小品级越高）
	for rank in [1, 2, 3, 4, 5, 6, 7]:
		var threshold = RANK_THRESHOLDS.get(rank, {})
		var prestige_ok = prestige >= threshold.get("prestige_min", 999)
		var members_ok = members_count >= threshold.get("members_min", 999)
		var merit_ok = not threshold.get("merit_required", false) or merit_level == "first_class"

		if prestige_ok and members_ok and merit_ok:
			family_rank_evaluated.emit(family_id, rank)
			return rank

	return 8


func can_marry(char_a_id: String, char_b_id: String) -> Dictionary:
	"""检查两个角色是否可以联姻
	返回 {can_marry: bool, reason: String}
	"""
	var char_a = GameManager.runtime_characters.get(char_a_id, {})
	var char_b = GameManager.runtime_characters.get(char_b_id, {})

	if char_a.is_empty() or char_b.is_empty():
		return {"can_marry": false, "reason": "角色不存在"}

	# 性别检查（默认异性）
	if char_a.get("gender", "male") == char_b.get("gender", "male"):
		return {"can_marry": false, "reason": "同性不可联姻"}

	# 存活检查
	if not char_a.get("is_alive", false) or not char_b.get("is_alive", false):
		return {"can_marry": false, "reason": "死亡或不存在"}

	# 年龄检查
	var age_a = char_a.get("current_age", 0)
	var age_b = char_b.get("current_age", 0)
	if age_a < 14 or age_b < 14:
		return {"can_marry": false, "reason": "未到适婚年龄"}
	if age_a > 50 or age_b > 50:
		return {"can_marry": false, "reason": "超出适婚年龄"}

	# 品级差检查
	var rank_a = GameManager.runtime_families.get(char_a.get("family_id", ""), {}).get("rank", 5)
	var rank_b = GameManager.runtime_families.get(char_b.get("family_id", ""), {}).get("rank", 5)
	var rank_diff = abs(rank_a - rank_b)

	if rank_diff > 4:
		return {"can_marry": false, "reason": "门第悬殊，不可联姻"}

	# 同族不可联姻
	if char_a.get("family_id", "") == char_b.get("family_id", ""):
		return {"can_marry": false, "reason": "同族不可联姻"}

	# 已婚检查
	if char_a.get("spouse_id", "") != "" or char_b.get("spouse_id", "") != "":
		return {"can_marry": false, "reason": "已订婚或已婚"}

	return {"can_marry": true, "reason": "条件满足", "rank_diff": rank_diff}


func generate_offspring(father_id: String, mother_id: String) -> Dictionary:
	"""基于父母属性生成后代属性
	算法（参考 GDD A2.2）：
	- 智力：父母各 50%
	- 武力：母方权重 60%
	- 魅力：父方权重 60%
	- 政才：父母各 50%
	- 德行：取较高者
	- 性格：混合+变异 ±10
	- 家世：就低不就高
	"""
	var father = GameManager.runtime_characters.get(father_id, {})
	var mother = GameManager.runtime_characters.get(mother_id, {})

	if father.is_empty() or mother.is_empty():
		return {}

	var offspring = {
		"stats": {},
		"personality": {},
		"birth_year": GameManager.current_year,
		"family_id": father.get("family_id", ""),
		"is_alive": true
	}

	# 五维属性继承
	var stats_template = ["intelligence", "martial", "charm", "governance", "virtue"]
	var weights = {
		"intelligence": [0.5, 0.5],
		"martial": [0.4, 0.6],  # 母方 60%
		"charm": [0.6, 0.4],     # 父方 60%
		"governance": [0.5, 0.5],
		"virtue": [1.0, 0.0]     # 取父方
	}

	for stat in stats_template:
		var father_val = father.get("stats", {}).get(stat, 50)
		var mother_val = mother.get("stats", {}).get(stat, 50)
		var w = weights[stat]
		var value = father_val * w[0] + mother_val * w[1]
		# 添加随机变异 ±5
		value += randf_range(-5.0, 5.0)
		value = clamp(value, 1, 100)
		offspring["stats"][stat] = int(value)

	# 性格继承：父母平均 + ±10 变异
	var personality_keys = ["ambition_conservatism", "introvert_extrovert",
							"kindness_severity", "wisdom_naivety", "independence_conformity"]
	for key in personality_keys:
		var father_p = father.get("personality", {}).get(key, 50)
		var mother_p = mother.get("personality", {}).get(key, 50)
		var value = (father_p + mother_p) / 2.0 + randf_range(-10.0, 10.0)
		value = clamp(value, 1, 100)
		offspring["personality"][key] = int(value)

	# 家世就低不就高
	var father_family = GameManager.runtime_families.get(father.get("family_id", ""), {})
	var mother_family = GameManager.runtime_families.get(mother.get("family_id", ""), {})
	var father_rank = father_family.get("rank", 5)
	var mother_rank = mother_family.get("rank", 5)
	offspring["initial_rank"] = max(father_rank, mother_rank)  # 数字越大品级越低

	return offspring


func add_family_merit(family_id: String, merit_level: String, merit_name: String) -> void:
	"""添加家族功业"""
	if family_id not in GameManager.runtime_families:
		return
	if "merits" not in GameManager.runtime_families[family_id]:
		GameManager.runtime_families[family_id]["merits"] = []

	GameManager.runtime_families[family_id]["merits"].append({
		"level": merit_level,
		"name": merit_name,
		"year": GameManager.current_year
	})

	# 更新当前最高功业等级
	var level_order = {"none": 0, "third_class": 1, "second_class": 2, "first_class": 3}
	var merit_order = level_order.get(merit_level, 0)
	var current_order = level_order.get(GameManager.runtime_families[family_id].get("current_merit_level", "none"), 0)
	if merit_order > current_order:
		GameManager.runtime_families[family_id]["current_merit_level"] = merit_level

	print("[FamilyManager] 家族 %s 新增功业: %s (%s)" % [family_id, merit_name, merit_level])


func call_family_meeting(topic: String) -> void:
	"""召开家族会议"""
	meeting_topics.append(topic)
	family_meeting_called.emit(topic)
	print("[FamilyManager] 家族会议召开: %s" % topic)


func resolve_family_meeting(topic: String, decision: String) -> void:
	"""决议家族会议"""
	meeting_topics.erase(topic)
	family_meeting_resolved.emit(topic, decision)
	print("[FamilyManager] 家族会议决议: %s -> %s" % [topic, decision])