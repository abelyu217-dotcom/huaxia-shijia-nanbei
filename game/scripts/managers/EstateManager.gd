extends Node
## EstateManager.gd - 田庄管理器
##
## 职责：
## 1. 田庄收入计算（季度/年度）
## 2. 田庄维护成本
## 3. 田庄建设/升级
## 4. 部曲管理
##
## 参考文档：docs/02-详细GDD.md 第 A3.2 节

# 田庄运行时数据
var runtime_estates: Dictionary = {}  # estate_id -> estate_data

# 信号
signal estate_income_calculated(family_id: String, total_income: int)
signal estate_built(estate_id: String, estate_name: String)
signal estate_upgraded(estate_id: String, new_level: int)


func _ready() -> void:
	pass


func initialize_player_estates(family_id: String) -> void:
	"""初始化玩家家族的田庄"""
	var family_estates = GameManager.estates_data.get("starting_estates", {}).get(family_id, [])
	for estate_data in family_estates:
		var estate_runtime = estate_data.duplicate(true)
		estate_runtime["current_output"] = 0
		estate_runtime["last_harvest_year"] = GameManager.current_year
		runtime_estates[estate_data["id"]] = estate_runtime


func calculate_quarterly_income() -> int:
	"""计算季度收入"""
	var total_income = 0
	for estate_id in runtime_estates:
		var estate = runtime_estates[estate_id]
		var type_id = estate.get("type", "standard")
		var type_config = GameManager.estates_data.get("estate_types", {}).get(type_id, {})
		var base_income = type_config.get("base_income", 100)
		var level = estate.get("level", 1)
		var income = base_income * (1 + (level - 1) * 0.2)
		total_income += int(income)
	return total_income


func calculate_yearly_income() -> int:
	"""计算年度收入"""
	var quarterly = calculate_quarterly_income()
	var yearly = quarterly * 4

	if GameManager.player_family_id != "":
		GameManager.modify_family_wealth(GameManager.player_family_id, yearly)
		estate_income_calculated.emit(GameManager.player_family_id, yearly)

	# 更新田庄收成年份
	for estate_id in runtime_estates:
		runtime_estates[estate_id]["last_harvest_year"] = GameManager.current_year

	if GameManager.debug_mode:
		print("[EstateManager] 年度收入: %d 钱" % yearly)
	return yearly


func calculate_yearly_expense() -> int:
	"""计算年度开支"""
	var total_expense = 0
	for estate_id in runtime_estates:
		var estate = runtime_estates[estate_id]
		var workers = estate.get("workers", 100)
		# 假设每个工人需要 5 钱/年（衣食住行）
		total_expense += workers * 5

	return total_expense


func can_build_estate(type_id: String) -> bool:
	"""检查是否可以建造指定类型的田庄"""
	var type_config = GameManager.estates_data.get("estate_types", {}).get(type_id, {})
	if type_config.is_empty():
		return false

	var family = GameManager.get_player_family()
	if family.is_empty():
		return false

	var min_rank = type_config.get("min_rank", 9)
	var current_rank = family.get("rank", 5)
	if current_rank > min_rank:  # 数字越大品级越低
		return false

	var cost = type_config.get("cost", 0)
	var wealth = family.get("wealth", 0)
	if wealth < cost:
		return false

	return true


func build_estate(type_id: String, location: String) -> bool:
	"""建造田庄"""
	if not can_build_estate(type_id):
		return false

	var type_config = GameManager.estates_data.get("estate_types", {}).get(type_id, {})
	var cost = type_config.get("cost", 0)

	# 扣钱
	GameManager.modify_family_wealth(GameManager.player_family_id, -cost)

	# 创建田庄
	var estate_id = "estate_%d_%d" % [GameManager.current_year, runtime_estates.size()]
	var new_estate = {
		"id": estate_id,
		"name": "%s之%s庄" % [location, type_config.get("name", "")],
		"type": type_id,
		"location": location,
		"level": 1,
		"workers": 100,
		"specialties": type_config.get("special_features", []),
		"build_year": GameManager.current_year
	}

	runtime_estates[estate_id] = new_estate
	estate_built.emit(estate_id, new_estate["name"])
	print("[EstateManager] 建造田庄: %s (类型: %s, 花费: %d)" % [new_estate["name"], type_config.get("name", ""), cost])
	return true


func upgrade_estate(estate_id: String) -> bool:
	"""升级田庄"""
	if estate_id not in runtime_estates:
		return false

	var estate = runtime_estates[estate_id]
	var current_level = estate.get("level", 1)
	var upgrade_cost = (current_level + 1) * 1000

	var family = GameManager.get_player_family()
	if family.get("wealth", 0) < upgrade_cost:
		return false

	GameManager.modify_family_wealth(GameManager.player_family_id, -upgrade_cost)
	estate["level"] = current_level + 1

	estate_upgraded.emit(estate_id, current_level + 1)
	print("[EstateManager] 升级田庄: %s → 等级 %d (花费 %d)" % [estate.get("name", estate_id), current_level + 1, upgrade_cost])
	return true


func get_player_estates() -> Array:
	"""获取玩家家族的所有田庄"""
	var result = []
	for estate_id in runtime_estates:
		var estate = runtime_estates[estate_id]
		result.append(estate)
	return result


func get_total_workers() -> int:
	"""获取玩家田庄的总工人数"""
	var total = 0
	for estate_id in runtime_estates:
		total += runtime_estates[estate_id].get("workers", 0)
	return total


func get_annual_summary() -> Dictionary:
	"""获取年度田庄汇总"""
	var income = calculate_yearly_income()
	var expense = calculate_yearly_expense()
	var net = income - expense

	return {
		"income": income,
		"expense": expense,
		"net": net,
		"estate_count": runtime_estates.size(),
		"total_workers": get_total_workers()
	}