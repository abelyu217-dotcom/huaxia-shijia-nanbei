extends Control
## FamilyPanel.gd - 家族面板（主界面）
##
## 职责：
## 1. 显示家族基本信息（家徽、属性、族人列表）
## 2. 显示田庄概况
## 3. 显示时间
## 4. 提供 5 个主操作按钮
##
## 对应 PRD 屏幕 1：家族面板

@onready var time_label: Label = $TopBar/TimeLabel
@onready var family_name_label: Label = $TopBar/FamilyName
@onready var family_rank_label: Label = $TopBar/FamilyRank
@onready var prestige_label: Label = $TopBar/PrestigeLabel
@onready var wealth_label: Label = $TopBar/WealthLabel

@onready var character_list: VBoxContainer = $MainPanel/CharacterScroll/CharacterList
@onready var estate_summary: VBoxContainer = $Sidebar/EstateScroll/EstateList

@onready var btn_cultivate: Button = $ActionBar/Buttons/CultivateButton
@onready var btn_marry: Button = $ActionBar/Buttons/MarryButton
@onready var btn_converse: Button = $ActionBar/Buttons/ConverseButton
@onready var btn_event: Button = $ActionBar/Buttons/EventButton
@onready var btn_advance: Button = $ActionBar/Buttons/AdvanceButton


func _ready() -> void:
	_refresh_all()
	_connect_signals()


func _connect_signals() -> void:
	GameManager.year_advanced.connect(_on_time_changed)
	GameManager.turn_advanced.connect(_on_time_changed)
	GameManager.family_prestige_changed.connect(_on_family_prestige_changed)
	GameManager.family_rank_changed.connect(_on_family_rank_changed)
	GameManager.event_triggered.connect(_on_event_triggered)

	btn_cultivate.pressed.connect(_on_cultivate_pressed)
	btn_marry.pressed.connect(_on_marry_pressed)
	btn_converse.pressed.connect(_on_converse_pressed)
	btn_event.pressed.connect(_on_event_pressed)
	btn_advance.pressed.connect(_on_advance_pressed)


func _refresh_all() -> void:
	_refresh_top_bar()
	_refresh_character_list()
	_refresh_estate_summary()


func _refresh_top_bar() -> void:
	"""刷新顶部信息栏"""
	var family = GameManager.get_player_family()
	var family_template = GameManager.families_data.get("families", {}).get(GameManager.player_family_id, {})

	time_label.text = GameManager.get_year_month_season_string()
	family_name_label.text = family_template.get("name", "?")
	family_rank_label.text = "%d品" % family.get("rank", 5)
	prestige_label.text = "声望: %d" % family.get("prestige", 0)
	wealth_label.text = "财富: %d" % family.get("wealth", 0)


func _refresh_character_list() -> void:
	"""刷新角色列表"""
	for child in character_list.get_children():
		child.queue_free()

	var chars = GameManager.get_all_living_characters()
	for char_data in chars:
		var row = _create_character_row(char_data)
		character_list.add_child(row)


func _create_character_row(char_data: Dictionary) -> Panel:
	"""创建角色行"""
	var panel = Panel.new()
	panel.custom_minimum_size = Vector2(0, 60)

	var hbox = HBoxContainer.new()
	hbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.add_child(hbox)

	var name_label = Label.new()
	name_label.text = "%s (%d岁)" % [char_data.get("name", "?"), char_data.get("current_age", 0)]
	name_label.custom_minimum_size = Vector2(120, 0)
	name_label.add_theme_font_size_override("font_size", 16)
	hbox.add_child(name_label)

	var office_label = Label.new()
	office_label.text = char_data.get("current_office", "")
	office_label.custom_minimum_size = Vector2(180, 0)
	office_label.add_theme_font_size_override("font_size", 14)
	hbox.add_child(office_label)

	var stats = char_data.get("stats", {})
	var stats_label = Label.new()
	stats_label.text = "智%d 武%d 魅%d 政%d 德%d" % [
		stats.get("intelligence", 0),
		stats.get("martial", 0),
		stats.get("charm", 0),
		stats.get("governance", 0),
		stats.get("virtue", 0)
	]
	stats_label.custom_minimum_size = Vector2(200, 0)
	stats_label.add_theme_font_size_override("font_size", 14)
	hbox.add_child(stats_label)

	return panel


func _refresh_estate_summary() -> void:
	"""刷新田庄概况"""
	for child in estate_summary.get_children():
		child.queue_free()

	var estates = EstateManager.get_player_estates()
	for estate in estates:
		var row = Label.new()
		var type_name = GameManager.estates_data.get("estate_types", {}).get(estate.get("type", ""), {}).get("name", "?")
		row.text = "%s（%s，等级%d）" % [estate.get("name", "?"), type_name, estate.get("level", 1)]
		row.add_theme_font_size_override("font_size", 14)
		estate_summary.add_child(row)

	# 年度汇总
	var summary = EstateManager.get_annual_summary()
	var total_label = Label.new()
	total_label.text = "\n年度收入: %d 钱 | 年度开支: %d 钱 | 净收入: %d 钱\n总田庄: %d | 总人口: %d 人" % [
		summary["income"], summary["expense"], summary["net"],
		summary["estate_count"], summary["total_workers"]
	]
	total_label.add_theme_font_size_override("font_size", 13)
	estate_summary.add_child(total_label)


func _on_time_changed(_arg1 = null, _arg2 = null) -> void:
	_refresh_top_bar()


func _on_family_prestige_changed(_family_id: String, _old: int, _new: int) -> void:
	_refresh_top_bar()


func _on_family_rank_changed(_family_id: String, _old: int, _new: int) -> void:
	_refresh_top_bar()


func _on_event_triggered(_event_id: String, _event_data: Dictionary) -> void:
	# 切换到事件显示场景
	pass


func _on_cultivate_pressed() -> void:
	print("[FamilyPanel] 进入养成界面")
	get_tree().change_scene_to_file("res://scenes/character/CultivationScene.tscn")


func _on_marry_pressed() -> void:
	print("[FamilyPanel] 进入联姻界面")
	get_tree().change_scene_to_file("res://scenes/character/MarriageScene.tscn")


func _on_converse_pressed() -> void:
	print("[FamilyPanel] 进入清谈界面")
	get_tree().change_scene_to_file("res://scenes/character/ConversationScene.tscn")


func _on_event_pressed() -> void:
	"""处理事件队列"""
	if not EventManager.pending_events.is_empty():
		EventManager.process_next_event()
	else:
		print("[FamilyPanel] 暂无待触发事件")


func _on_advance_pressed() -> void:
	"""推进一个季度"""
	TimeManager.advance_one_season()
	# 检查事件触发
	EventManager.check_triggers()
	_refresh_all()