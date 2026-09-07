extends Control
## MainMenu.gd - 主菜单场景
##
## 职责：
## 1. 显示游戏标题
## 2. 选择时代和家族
## 3. 开始新游戏/读取存档/退出
##
## 对应 PRD 屏幕 1：家族选择

@onready var title_label: Label = $VBox/Title
@onready var family_grid: GridContainer = $VBox/HBox/FamilyGrid
@onready var info_panel: Panel = $VBox/HBox/InfoPanel
@onready var start_button: Button = $VBox/Buttons/StartButton
@onready var back_button: Button = $VBox/Buttons/BackButton

var selected_family_id: String = ""

# 3个预设家族
var preset_families = [
	{
		"id": "wang_langya",
		"name": "琅琊王氏",
		"junwang": "琅琊",
		"description": "东晋第一望族，王导辅政奠定百年基业",
		"famous": "王导",
		"start_year": 317,
		"color": "#B83A2F"
	},
	{
		"id": "xie_chenjun",
		"name": "陈郡谢氏",
		"junwang": "陈郡",
		"description": "淝水之战主角家族，谢安、谢玄以八万破百万",
		"famous": "谢安",
		"start_year": 357,
		"color": "#5D8B6F"
	},
	{
		"id": "huan_qiaoguo",
		"name": "谯国桓氏",
		"junwang": "谯国",
		"description": "枭雄桓温家族，三次北伐震动东晋",
		"famous": "桓温",
		"start_year": 347,
		"color": "#5B7B8F"
	}
]


func _ready() -> void:
	_populate_family_grid()
	start_button.disabled = true


func _populate_family_grid() -> void:
	"""填充家族选择网格"""
	for family_data in preset_families:
		var card = _create_family_card(family_data)
		family_grid.add_child(card)


func _create_family_card(family_data: Dictionary) -> Button:
	"""创建家族卡片"""
	var btn = Button.new()
	btn.custom_minimum_size = Vector2(280, 360)
	btn.text = "%s\n%s\n%s" % [family_data["name"], family_data["junwang"], family_data["start_year"]]
	btn.add_theme_font_size_override("font_size", 18)
	btn.alignment = HORIZONTAL_ALIGNMENT_CENTER

	# 设置背景色
	var style_box = StyleBoxFlat.new()
	var color = Color(family_data["color"])
	style_box.bg_color = Color(color.r * 0.8, color.g * 0.8, color.b * 0.8, 0.9)
	style_box.border_color = color
	style_box.set_border_width_all(3)
	style_box.set_corner_radius_all(8)
	btn.add_theme_stylebox_override("normal", style_box)

	var hover_style = style_box.duplicate()
	hover_style.bg_color = color
	btn.add_theme_stylebox_override("hover", hover_style)

	btn.pressed.connect(_on_family_selected.bind(family_data))
	return btn


func _on_family_selected(family_data: Dictionary) -> void:
	"""家族被选中"""
	selected_family_id = family_data["id"]
	_update_info_panel(family_data)
	start_button.disabled = false


func _update_info_panel(family_data: Dictionary) -> void:
	"""更新家族详情面板"""
	var info_text = """
家族：%s
郡望：%s
时代起点：%d 年
代表人物：%s

家族简介：
%s
""" % [
		family_data["name"],
		family_data["junwang"],
		family_data["start_year"],
		family_data["famous"],
		family_data["description"]
	]

	for child in info_panel.get_children():
		child.queue_free()

	var label = Label.new()
	label.text = info_text.strip_edges()
	label.add_theme_font_size_override("font_size", 16)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	info_panel.add_child(label)


func _on_start_button_pressed() -> void:
	"""开始新游戏"""
	if selected_family_id == "":
		return

	print("[MainMenu] 开始新游戏，家族: %s" % selected_family_id)
	GameManager.start_new_game(selected_family_id)
	EstateManager.initialize_player_estates(selected_family_id)
	get_tree().change_scene_to_file("res://scenes/family/FamilyPanel.tscn")


func _on_back_button_pressed() -> void:
	"""返回"""
	get_tree().quit()