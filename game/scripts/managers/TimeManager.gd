extends Node
## TimeManager.gd - 时间管理器
##
## 职责：
## 1. 推进游戏时间（年/月/季）
## 2. 触发季节性事件
## 3. 角色年龄增长
## 4. 田庄收成结算
##
## 参考文档：docs/02-详细GDD.md 第 C2 节

# 时间状态（从 GameManager 同步）
# var current_year: int = 317
# var current_month: int = 1
# var current_season: String = "spring"

# 季节事件配置
const SEASONAL_EVENTS = {
	"spring": ["春耕", "会亲", "议亲", "祭祀先祖"],
	"summer": ["夏耘", "清谈雅集", "上书言事", "科举考试"],
	"autumn": ["秋收", "祭祀先祖", "朝会议事", "田猎"],
	"winter": ["冬藏", "家族宴会", "年终总结", "岁贡"]
}

# 玩家推进控制
var is_animating: bool = false  # 防止快速点击
var time_speed: float = 1.0     # 时间速度倍数

# 信号
signal season_changed(new_season: String)
signal month_changed(new_month: int)
signal year_changed(new_year: int)
signal seasonal_event_triggered(event_name: String)


func _ready() -> void:
	# 监听 GameManager 的时间推进
	if GameManager:
		GameManager.turn_advanced.connect(_on_turn_advanced)
		GameManager.year_advanced.connect(_on_year_advanced)


func _on_turn_advanced(new_season: String, new_month: int) -> void:
	season_changed.emit(new_season)
	month_changed.emit(new_month)
	_trigger_seasonal_event(new_season)


func _on_year_advanced(new_year: int) -> void:
	year_changed.emit(new_year)
	_on_year_end()


func _trigger_seasonal_event(season: String) -> void:
	"""触发季节性事件"""
	var events = SEASONAL_EVENTS.get(season, [])
	if events.size() == 0:
		return
	var random_event = events[randi() % events.size()]
	seasonal_event_triggered.emit(random_event)
	if GameManager.debug_mode:
		print("[TimeManager] 季节性事件: %s" % random_event)


func _on_year_end() -> void:
	"""年终结算"""
	# 角色年龄增长
	CharacterManager.age_characters_on_year_advance()

	# 田庄收入结算
	EstateManager.calculate_yearly_income()

	# 家族开支结算
	FamilyManager._ready()  # placeholder
	# TODO: 计算家族年度开支

	if GameManager.debug_mode:
		print("[TimeManager] 年终结算完成 (%d 年)" % GameManager.current_year)


func advance_one_month() -> void:
	"""推进一个月"""
	if is_animating:
		return
	is_animating = true

	GameManager.advance_time(1)
	is_animating = false


func advance_one_season() -> void:
	"""推进一个季节（3个月）"""
	if is_animating:
		return
	is_animating = true

	GameManager.advance_time(3)
	is_animating = false


func advance_one_year() -> void:
	"""推进一年"""
	if is_animating:
		return
	is_animating = true

	var target_month = GameManager.current_month
	GameManager.advance_time(12)
	is_animating = false


func get_current_season_name() -> String:
	"""获取当前季节中文名"""
	var names = {"spring": "春", "summer": "夏", "autumn": "秋", "winter": "冬"}
	return names.get(GameManager.current_season, "?")


func get_month_name() -> String:
	"""获取当前月份中文名"""
	var names = ["正月", "二月", "三月", "四月", "五月", "六月",
				 "七月", "八月", "九月", "十月", "十一月", "十二月"]
	if GameManager.current_month >= 1 and GameManager.current_month <= 12:
		return names[GameManager.current_month - 1]
	return "?"