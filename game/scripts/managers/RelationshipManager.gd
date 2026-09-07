extends Node
## RelationshipManager.gd - 关系管理器
##
## 职责：
## 1. 血缘关系（父、母、子、女、兄弟姐妹）
## 2. 姻亲关系（妻、夫、岳父、岳母、婿、媳）
## 3. 社交关系（友、敌、师、生）
## 4. 政治关系（主君、臣下、盟友）
##
## 参考文档：docs/02-详细GDD.md 第 A1.4 节

enum RelationType {
	# 血缘关系
	FATHER,
	MOTHER,
	SON,
	DAUGHTER,
	# 姻亲关系
	SPOUSE,
	FATHER_IN_LAW,
	MOTHER_IN_LAW,
	SON_IN_LAW,
	DAUGHTER_IN_LAW,
	# 社交关系
	FRIEND,
	ENEMY,
	MENTOR,
	STUDENT,
	# 政治关系
	LIEGE,
	VASSAL,
	ALLY,
	RIVAL
}

const RELATION_NAMES = {
	RelationType.FATHER: "父",
	RelationType.MOTHER: "母",
	RelationType.SON: "子",
	RelationType.DAUGHTER: "女",
	RelationType.SPOUSE: "配偶",
	RelationType.FATHER_IN_LAW: "岳父/公公",
	RelationType.MOTHER_IN_LAW: "岳母/婆婆",
	RelationType.SON_IN_LAW: "婿",
	RelationType.DAUGHTER_IN_LAW: "媳",
	RelationType.FRIEND: "友",
	RelationType.ENEMY: "敌",
	RelationType.MENTOR: "师",
	RelationType.STUDENT: "生",
	RelationType.LIEGE: "主君",
	RelationType.VASSAL: "臣下",
	RelationType.ALLY: "盟友",
	RelationType.RIVAL: "政敌"
}

# 关系数据存储
# 格式：relations[char_a_id][char_b_id] = {type: RelationType, value: int, year_established: int}
var relations: Dictionary = {}

# 信号
signal relationship_established(char_a_id: String, char_b_id: String, type: int)
signal relationship_changed(char_a_id: String, char_b_id: String, old_value: int, new_value: int)
signal relationship_ended(char_a_id: String, char_b_id: String, type: int)


func _ready() -> void:
	pass


func establish_relationship(char_a_id: String, char_b_id: String, type: int, initial_value: int = 50) -> void:
	"""建立关系"""
	if char_a_id == char_b_id:
		return

	if char_a_id not in relations:
		relations[char_a_id] = {}

	var rel = {
		"target_id": char_b_id,
		"type": type,
		"value": initial_value,
		"year_established": GameManager.current_year
	}

	relations[char_a_id][char_b_id] = rel
	relationship_established.emit(char_a_id, char_b_id, type)
	print("[RelationshipManager] 建立关系: %s -> %s (%s)" % [
		char_a_id, char_b_id, RELATION_NAMES.get(type, "?")
	])


func modify_relationship(char_a_id: String, char_b_id: String, delta: int) -> void:
	"""修改关系值"""
	if char_a_id not in relations or char_b_id not in relations[char_a_id]:
		return

	var rel = relations[char_a_id][char_b_id]
	var old_value = rel.value
	var new_value = clamp(old_value + delta, -100, 100)
	rel.value = new_value

	relationship_changed.emit(char_a_id, char_b_id, old_value, new_value)


func get_relationship(char_a_id: String, char_b_id: String) -> Dictionary:
	"""获取关系数据"""
	if char_a_id not in relations or char_b_id not in relations[char_a_id]:
		return {}
	return relations[char_a_id][char_b_id]


func get_relationships_of(char_id: String) -> Array:
	"""获取角色的所有关系"""
	var result = []
	if char_id in relations:
		for target_id in relations[char_id]:
			result.append(relations[char_id][target_id])
	return result


func get_relationships_by_type(char_id: String, type: int) -> Array:
	"""按类型获取关系"""
	var result = []
	var all_rels = get_relationships_of(char_id)
	for rel in all_rels:
		if rel.type == type:
			result.append(rel)
	return result


func end_relationship(char_a_id: String, char_b_id: String) -> void:
	"""结束关系"""
	if char_a_id not in relations or char_b_id not in relations[char_a_id]:
		return

	var rel = relations[char_a_id][char_b_id]
	relations[char_a_id].erase(char_b_id)

	relationship_ended.emit(char_a_id, char_b_id, rel.type)


func set_marriage(char_a_id: String, char_b_id: String) -> void:
	"""设置婚姻关系（双向）"""
	establish_relationship(char_a_id, char_b_id, RelationType.SPOUSE, 80)
	establish_relationship(char_b_id, char_a_id, RelationType.SPOUSE, 80)

	# 更新角色数据的配偶字段
	var char_a = GameManager.runtime_characters.get(char_a_id, {})
	var char_b = GameManager.runtime_characters.get(char_b_id, {})
	if char_a:
		char_a["spouse_id"] = char_b_id
	if char_b:
		char_b["spouse_id"] = char_a_id

	# 设置姻亲关系
	var father_a_id = char_a.get("father_id", "")
	var father_b_id = char_b.get("father_id", "")
	if father_a_id != "":
		establish_relationship(father_a_id, char_b_id, RelationType.SON_IN_LAW, 60)
	if father_b_id != "":
		establish_relationship(father_b_id, char_a_id, RelationType.SON_IN_LAW, 60)


func break_marriage(char_a_id: String, char_b_id: String) -> void:
	"""解除婚姻关系"""
	end_relationship(char_a_id, char_b_id)
	end_relationship(char_b_id, char_a_id)

	var char_a = GameManager.runtime_characters.get(char_a_id, {})
	var char_b = GameManager.runtime_characters.get(char_b_id, {})
	if char_a:
		char_a["spouse_id"] = ""
	if char_b:
		char_b["spouse_id"] = ""


func get_allies(family_id: String) -> Array:
	"""获取家族的所有盟友角色"""
	var allies = []
	for char_a_id in relations:
		var char_a = GameManager.runtime_characters.get(char_a_id, {})
		if char_a.get("family_id", "") != family_id:
			continue
		for char_b_id in relations[char_a_id]:
			var rel = relations[char_a_id][char_b_id]
			if rel.type == RelationType.FRIEND and rel.value >= 60:
				var char_b = GameManager.runtime_characters.get(char_b_id, {})
				if char_b and char_b.get("is_alive", false):
					allies.append(char_b)
	return allies


func get_enemies(family_id: String) -> Array:
	"""获取家族的所有敌对角色"""
	var enemies = []
	for char_a_id in relations:
		var char_a = GameManager.runtime_characters.get(char_a_id, {})
		if char_a.get("family_id", "") != family_id:
			continue
		for char_b_id in relations[char_a_id]:
			var rel = relations[char_a_id][char_b_id]
			if rel.type == RelationType.ENEMY and rel.value <= -40:
				var char_b = GameManager.runtime_characters.get(char_b_id, {})
				if char_b and char_b.get("is_alive", false):
					enemies.append(char_b)
	return enemies