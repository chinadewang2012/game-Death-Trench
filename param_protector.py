# 参数保护工具
# 用法：将此脚本放到参数文件同目录，双击运行或拖拽文件到图标上
# 密码 = 文件名
# 文件名检测不过，不给赋值
# 默认生成不带密码的（防止开挂）

import json
import os
import sys
import hashlib

def get_file_password(filename):
    """从文件名提取密码（去掉扩展名）"""
    name = os.path.splitext(filename)[0]
    return name

def verify_filename(filename):
    """文件名检测：必须包含特定标记才算合法"""
    name = os.path.splitext(filename)[0]
    # 必须包含 _params_ 或 _game_ 等标记
    valid_markers = ['_params_', '_game_', '_config_', '_param_']
    for marker in valid_markers:
        if marker in name.lower():
            return True
    return False

def simple_hash(data, password):
    """简单的哈希校验"""
    content = json.dumps(data, sort_keys=True)
    combined = content + password
    return hashlib.md5(combined.encode()).hexdigest()

def process_file(filepath):
    """处理参数文件"""
    dirname = os.path.dirname(filepath)
    filename = os.path.basename(filepath)

    print(f"正在处理: {filename}")

    # 读取参数
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"错误：读取文件失败 - {e}")
        input("\n按回车键退出...")
        return

    # 提取密码
    password = get_file_password(filename)
    print(f"密码（文件名）: {password}")

    # 文件名检测
    if not verify_filename(filename):
        print("错误：文件名检测不通过！")
        print("文件名必须包含 _params_ 或 _game_ 或 _config_ 等标记")
        print("示例：game_params_mysecret.json")
        print("\n不给赋值！")
        input("\n按回车键退出...")
        return

    # 生成带校验的版本
    checksum = simple_hash(data, password)

    protected_data = {
        "_protected": True,
        "_version": "1.0",
        "_checksum": checksum,
        "_password": password,
        "data": data
    }

    # 生成新文件名
    base_name = os.path.splitext(filename)[0]
    output_name = f"{base_name}_protected.json"
    output_path = os.path.join(dirname, output_name)

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(protected_data, f, indent=2, ensure_ascii=False)
        print(f"\n成功！已生成受保护版本：")
        print(f"  {output_name}")
        print(f"\n校验信息：")
        print(f"  MD5: {checksum}")
    except Exception as e:
        print(f"错误：写入文件失败 - {e}")

    input("\n按回车键退出...")

def create_default_file():
    """创建默认的不带密码的参数文件"""
    print("=" * 50)
    print("  参数保护工具")
    print("=" * 50)
    print()

    # 获取当前目录
    dirname = os.getcwd()
    default_name = "game_params.json"
    default_path = os.path.join(dirname, default_name)

    # 默认参数模板
    default_params = {
        "WEAPONS": [
            {"name": "手枪", "damage": 25, "fireRate": 250, "clipSize": 15, "range": 30, "icon": "🔫"},
            {"name": "步枪", "damage": 30, "fireRate": 150, "clipSize": 30, "range": 40, "icon": "🔴"},
            {"name": "狙击枪", "damage": 120, "fireRate": 1000, "clipSize": 5, "range": 60, "icon": "🎯"}
        ],
        "ENEMY": {
            "health": 80,
            "damage": {"easy": 8, "normal": 12, "hard": 18},
            "moveSpeed": 0.35,
            "fireRate": 1500,
            "spawnInterval": 3000,
            "count": 8
        },
        "PLAYER": {
            "maxHealth": 100,
            "moveSpeed": 100,
            "bulletSpeed": 15,
            "invincibilityTime": 1000
        },
        "MAP": {
            "obstacleRate": 0.08,
            "coverRate": 0.14,
            "buildingRate": 0.18,
            "waterRate": 0.2,
            "MAP_SIZE": 150
        },
        "DROPS": {
            "coinMin": 10,
            "coinMax": 30,
            "medkitHeal": 30,
            "grenadeDamage": 150,
            "grenadeRadius": 4,
            "ammoRefillAll": 30,
            "starScore": 500
        },
        "BUFFS": {
            "speedBoostMultiplier": 1.5,
            "speedBoostDuration": 30000,
            "damageReductionMultiplier": 0.5
        }
    }

    print("使用方法：")
    print("1. 拖拽 JSON 参数文件到此程序图标上，即可加密保护")
    print("2. 或者双击运行，生成默认参数文件")
    print()
    print("注意：")
    print("- 密码 = 文件名（不含扩展名）")
    print("- 文件名必须包含 _params_ 或 _game_ 等标记")
    print("- 检测不过，不给赋值！")
    print()

    if os.path.exists(default_path):
        print(f"默认文件已存在：{default_name}")
        response = input("是否覆盖？(y/n): ")
        if response.lower() != 'y':
            print("已取消")
            input("\n按回车键退出...")
            return

    try:
        with open(default_path, 'w', encoding='utf-8') as f:
            json.dump(default_params, f, indent=2, ensure_ascii=False)
        print(f"\n已生成默认参数文件：{default_name}")
        print("（此文件不带密码，可直接由正式版使用）")
    except Exception as e:
        print(f"错误：创建文件失败 - {e}")

    input("\n按回车键退出...")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # 有文件参数，处理该文件
        filepath = sys.argv[1]
        if os.path.isfile(filepath):
            process_file(filepath)
        else:
            print(f"文件不存在：{filepath}")
            input("\n按回车键退出...")
    else:
        # 无参数，显示创建默认文件
        create_default_file()
