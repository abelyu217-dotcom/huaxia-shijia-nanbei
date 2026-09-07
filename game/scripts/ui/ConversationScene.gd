extends Control
## ConversationScene.gd - 清谈品评界面
##
## 职责：
## 1. 选择辩手（2-4名族人）
## 2. 选择议题
## 3. 判定胜负
## 4. 应用声望变化
##
## 对应 PRD 屏幕 D：清谈品评

@onready var topic_dropdown: OptionButton = $VBox/TopicSection/TopicDropdown
@onready var debater_list: VBoxContainer = $VBox/DebaterScroll/DebaterList
@onready var start_button: Button = $VBox/StartButton
@onready var result_label: Label = $VBox/ResultLabel
@onready var back_button: Button = $VBox/BackButton

# 清谈议题
var topics = [
	{"id": "laozhuang", "name": "老庄", "difficulty": "hard"},
	{"id": "zhouyi", "name": "周易", "difficulty": "hard"},
	{"id": "foli", "name": "佛理", "difficulty": "normal"},
	{"id": "renwupinping", "name": "人物品评", "difficulty": "normal"},
	{"id": "shiwen", "name": "诗文", "difficulty": "easy"},
	{"id": "qinqihuihua", "name": "琴棋书画", "difficulty": "easy"},
	{"id": "zhengshi", "name": "政事", "difficulty": "hard"},
	{"id": "junshi", "name": "军事", "difficulty": "hard"}
]

var selected_topic_id: String = ""
var selected_debater_ids: Array = []


func _ready() -> void:
	_populate_topics()
	_populate_debaters()

	topic_dropdown.item_selected.connect(_on_topic_selected)
	start_button.pressed.connect(_on_start_pressed)
	back_button.pressed.connect(_on_back_pressed)
	start_button.disabled = true


func _populate_topics() -> void:
	for topic in topics:
		topic_dropdown.add_item("%s（%s）" % [topic["name"], _get_difficulty_name(topic["difficulty"])])
	if topics.size() > 0:
		topic_dropdown.selected = 0
		selected_topic_id = topics[0]["id"]


func _get_difficulty_name(difficulty: String) -> String:
	match difficulty:
		"easy": return "入门"
		"normal": return "普通"
		"hard": return "高级"
		"expert": return "大师"
		_: return "?"


func _populate_debaters() -> void:
	"""填充可选辩手列表"""
	for child in debater_list.get_children():
		child.queue_free()

	var chars = GameManager.get_all_living_characters()
	for char_data in chars:
		var age = char_data.get("current_age", 0)
		if age < 14:
			continue

		var row = HBoxContainer.new()
		row.custom_minimum_size = Vector2(0, 40)

		var checkbox = CheckBox.new()
		checkbox.text = "%s (%d岁) - %s" % [
			char_data.get("name", "?"), age, char_data.get("current_office", "无")
		]
		checkbox.toggled.connect(_on_debater_toggled.bind(char_data.get("id", "")))
		row.add_child(checkbox)

		debater_list.add_child(row)


func _on_debater_toggled(pressed: bool, char_id: String) -> void:
	if pressed:
		if char_id not in selected_debater_ids:
			selected_debater_ids.append(char_id)
	else:
		selected_debater_ids.erase(char_id)

	start_button.disabled = selected_debater_ids.size() < 2 or selected_debater_ids.size() > 4


func _on_topic_selected(index: int) -> void:
	if index < topics.size():
		selected_topic_id = topics[index]["id"]


func _on_start_pressed() -> void:
	"""开始清谈"""
	if selected_debater_ids.size() < 2:
		return

	var topic_name = ""
	for t in topics:
		if t["id"] == selected_topic_id:
			topic_name = t["name"]
			break

	# 计算胜率
	var total_skill = 0.0
	var avg_intelligence = 0.0
	var avg_charm = 0.0

	for char_id in selected_debater_ids:
		var char_data = GameManager.get_character(char_id)
		# 议题相关技能
		var relevant_skill = _get_relevant_skill(selected_topic_id)
		var skill_value = char_data.get("skills", {}).get(relevant_skill, 0)
		total_skill += skill_value
		avg_intelligence += char_data.get("stats", {}).get("intelligence", 0)
		avg_charm += char_data.get("stats", {}).get("charm", 0)

	var debater_count = selected_debater_ids.size()
	total_skill = total_skill / debater_count
	avg_intelligence = avg_intelligence / debater_count
	avg_charm = avg_charm / debater_count

	# 胜率公式：技能40% + 智力30% + 魅力20% + 随机10%
	var success_rate = total_skill * 0.4 + avg_intelligence * 0.3 + avg_charm * 0.2 + randf_range(0, 10)
	success_rate = clamp(success_rate, 0, 100)

	var random_value = randf_range(0, 100)
	var outcome = ""

	if random_value < success_rate * 0.3:
		outcome = "great_victory"
	elif random_value < success_rate:
		outcome = "victory"
	elif random_value < success_rate + (100 - success_rate) * 0.5:
		outcome = "draw"
	elif random_value < success_rate + (100 - success_rate) * 0.8:
		outcome = "defeat"
	else:
		outcome = "great_defeat"

	# 应用后果
	var rewards = GameManager.game_config.get("conversation_system", {}).get("rewards", {}).get(outcome, {})
	for key in rewards:
		if key == "culture":
			var family = GameManager.get_player_family()
			if family:
				family["culture"] = family.get("culture", 0) + int(rewards[key])
		elif key == "prestige":
			GameManager.modify_family_prestige(GameManager.player_family_id, int(rewards[key]))

	# 显示结果
	var outcome_names = {
		"great_victory": "大胜！辩者倾倒，听者动容",
	"victory": "胜利！你的观点获得认可",
	"draw": "平局，难分高下",
	"defeat": "失败，观点受到质疑",
	"great_defeat": "惨败，颜面尽失"
	}

	var debater_names = []
	for char_id in selected_debater_ids:
		var char_data = GameManager.get_character(char_id)
		debater_names.append(char_data.get("name", "?"))

	result_label.text = """
清谈结果

议题：%s
辩手：%s
胜率：%.1f%%
随机值：%.1f
结果：%s

文化声望变化：%s
家族声望变化：%s
""" % [
		topic_name,
		", ".join(debater_names),
		success_rate,
		random_value,
		outcome_names.get(outcome, outcome),
		rewards.get("culture", 0),
		rewards.get("prestige", 0)
	]

	# 推进时间（清谈用一个月）
	TimeManager.advance_one_month()
	print("[ConversationScene] 清谈结束: %s" % outcome_names.get(outcome, outcome))


func _get_relevant_skill(topic_id: String) -> String:
	"""根据议题获取相关技能"""
	match topic_id:
		"laozhuang": return "philosophy"
		"zhouyi": return "classical_studies"
		"foli": return "buddhism"
		"renwupinping": return "governance"
		"shiwen": return "literature"
		"qinqihuihua": return "calligraphy"
		"zhengshi": return "governance"
		"junshi": return "military_strategy"
		_: return "philosophy"


func _on_back_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/family/FamilyPanel.tscn")