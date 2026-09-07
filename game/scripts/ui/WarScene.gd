extends Control
## WarScene.gd - 战争场景（淝水之战）
##
## 职责：
## 1. 显示战争背景
## 2. 玩家决定投入兵力
## 3. 战斗结算
## 4. 应用后果
##
## 对应 PRD 屏幕 E：淝水之战

@onready var info_label: Label = $VBox/InfoLabel
@onready var strategy_dropdown: OptionButton = $VBox/StrategySection/StrategyDropdown
@onready var commitment_slider: HSlider = $VBox/CommitmentSection/CommitmentSlider
@onready var commitment_label: Label = $VBox/CommitmentSection/CommitmentLabel
@onready var execute_button: Button = $VBox/ExecuteButton
@onready var result_label: Label = $VBox/ResultLabel
@onready var back_button: Button = $VBox/BackButton

# 策略选项
var strategies = [
	{"id": "all_out", "name": "全力出击", "desc": "投入全部兵力", "modifier": 1.0},
	{"id": "cautious", "name": "谨慎推进", "desc": "保存实力，稳扎稳打", "modifier": 0.7},
	{"id": "defensive", "name": "坚守建康", "desc": "被动防守", "modifier": 0.4}
]


func _ready() -> void:
	_display_war_info()
	_populate_strategies()

	strategy_dropdown.item_selected.connect(_on_strategy_selected)
	commitment_slider.value_changed.connect(_on_commitment_changed)
	execute_button.pressed.connect(_on_execute_pressed)
	back_button.pressed.connect(_on_back_pressed)


func _display_war_info() -> void:
	info_label.text = """
【淝水之战】公元383年

前秦天王苻坚率90万大军南下伐晋，声称'投鞭断流'。
东晋朝廷震恐，谢安举荐谢玄率八万北府兵迎战。

【我方实力】
北府兵：8万（精锐）
谢玄：统帅，军事95
谢安：主帅，魅力98

【敌方实力】
前秦军：90万（来源复杂，士气不稳）
苻坚：自大，求胜心切

【战场】
淝水两岸，对峙中。
"""


func _populate_strategies() -> void:
	for strategy in strategies:
		strategy_dropdown.add_item("%s - %s" % [strategy["name"], strategy["desc"]])
	strategy_dropdown.selected = 0


func _on_strategy_selected(_index: int) -> void:
	pass


func _on_commitment_changed(value: float) -> void:
	commitment_label.text = "投入兵力: %d%%（约 %d 万人）" % [int(value), int(value * 8 / 100)]


func _on_execute_pressed() -> void:
	"""执行战斗"""
	var strategy_index = strategy_dropdown.selected
	var strategy = strategies[strategy_index]
	var commitment = commitment_slider.value / 100.0

	# 基础胜率：谢玄95 + 谢安98 + 北府兵精锐 = 75%
	var base_win_rate = 75.0

	# 策略修正
	var strategy_modifier = strategy["modifier"]

	# 投入度修正（过100%投入反而降低士气）
	var commitment_modifier = 1.0
	if commitment > 0.8:
		commitment_modifier = 0.9  # 过度投入可能指挥失当
	elif commitment < 0.5:
		commitment_modifier = 0.8  # 投入不足

	# 随机因素（地形、天气、敌军士气）
	var random_factor = randf_range(-15, 15)

	# 最终胜率
	var final_win_rate = base_win_rate * strategy_modifier * commitment_modifier + random_factor
	final_win_rate = clamp(final_win_rate, 0, 100)

	# 判定结果
	var outcome = ""
	var random_value = randf_range(0, 100)

	if random_value < final_win_rate * 0.4:
		outcome = "great_victory"
	elif random_value < final_win_rate:
		outcome = "victory"
	elif random_value < final_win_rate + (100 - final_win_rate) * 0.6:
		outcome = "draw"
	elif random_value < final_win_rate + (100 - final_win_rate) * 0.85:
		outcome = "defeat"
	else:
		outcome = "great_defeat"

	# 应用后果
	_apply_war_consequences(outcome, commitment)

	# 显示结果
	_display_war_result(outcome, final_win_rate, random_value, strategy)


func _apply_war_consequences(outcome: String, commitment: float) -> void:
	"""应用战争后果"""
	var family_id = GameManager.player_family_id

	match outcome:
		"great_victory":
			GameManager.modify_family_prestige(family_id, 50)
			FamilyManager.add_family_merit(family_id, "first_class", "淝水大捷")
			var current_rank = GameManager.runtime_families.get(family_id, {}).get("rank", 5)
			GameManager.modify_family_rank(family_id, max(1, current_rank - 1))
			GameManager.runtime_families[family_id]["military_strength"] = GameManager.runtime_families[family_id].get("military_strength", 0) + 30
		"victory":
			GameManager.modify_family_prestige(family_id, 25)
			FamilyManager.add_family_merit(family_id, "second_class", "淝水小胜")
		"draw":
			GameManager.modify_family_prestige(family_id, 5)
		"defeat":
			GameManager.modify_family_prestige(family_id, -10)
			FamilyManager.add_family_merit(family_id, "third_class", "淝水小败")
		"great_defeat":
			GameManager.modify_family_prestige(family_id, -50)
			var current_rank = GameManager.runtime_families.get(family_id, {}).get("rank", 5)
			GameManager.modify_family_rank(family_id, min(9, current_rank + 2))


func _display_war_result(outcome: String, win_rate: float, random_value: float, strategy: Dictionary) -> void:
	var outcome_text = ""
	match outcome:
		"great_victory": outcome_text = "【大捷】秦军溃败，'投鞭断流'成笑柄！苻坚仅以身免，前秦帝国崩溃。"
		"victory": outcome_text = "【胜利】淝水一战，秦军大败。"
		"draw": outcome_text = "【平局】双方对峙，未分胜负。"
		"defeat": outcome_text = "【小败】我军受挫，损失惨重。"
		"great_defeat": outcome_text = "【惨败】晋军大败，建康危急。"

	var consequences = ""
	match outcome:
		"great_victory": consequences = "家族声望+50 | 一等功业 | 品级上升 | 军事力量+30"
		"victory": consequences = "家族声望+25 | 二等功业"
		"draw": consequences = "家族声望+5"
		"defeat": consequences = "家族声望-10 | 三等功业"
		"great_defeat": consequences = "家族声望-50 | 品级下降"

	result_label.text = """
战役结算

策略：%s
投入：%d%%
计算胜率：%.1f%%
随机值：%.1f

结果：%s

后续影响：
%s
""" % [strategy["name"], int(commitment_slider.value), win_rate, random_value, outcome_text, consequences]


func _on_back_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/family/FamilyPanel.tscn")