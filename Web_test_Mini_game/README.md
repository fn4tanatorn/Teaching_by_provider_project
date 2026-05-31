# Medica Mist Quest

Pixel fantasy medicine board game prototype.

## Core Loop

- Map มาตรฐานขนาด 100 x 100
- ด่านเริ่มจากขอบด้านใดด้านหนึ่งของ map
- หน้าเล่นแสดง map 100 x 100 ทั้งผืนในครั้งเดียว
- map อยู่กับที่ และตัวหมอ pixel เป็นสิ่งที่เคลื่อนที่บน map
- เดินได้เฉพาะ block ทางเดินที่ติดกัน โดยใช้ปุ่มทิศทางหรือ keyboard
- ตัวละครผู้เล่นเป็นหมอ pixel ขนาดเล็ก
- จุดคำถามถูกแทนด้วย Boss
- Boss มี 3 ระดับ: B1 ง่าย, B2 กลาง, B3 ยาก
- ตอบ Boss ถูกจึงเดินผ่านช่องนั้นได้

## Screens

- หน้าหลัก
- เลือกด่าน
- หน้าเล่นเกม
- ระบบหลังบ้านสำหรับออกแบบ map และเพิ่ม Boss

## Run

เปิด `index.html` ได้โดยตรง หรือรัน local server:

```bash
python3 -m http.server 5173
```

จากนั้นเปิด `http://localhost:5173`
