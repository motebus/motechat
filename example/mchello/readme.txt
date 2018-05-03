The installtion of motechat hello program

1. This program runs under nodejs environment.

2. Install nodejs to your PC or server.

3. Download motebus program and motechat hello program from https://www.ypcloud.com/download/

4. Unzip the zip files of this program and copy to the project directory of nodejs

5. Run motebus program (according to the OS environment). For example: MoteBus_Win32.exe at window enronemnt.

6. At mchello directory, edit conf/mote.json file, key in EiName of device.

7. At the project directory, run motechat hello program, "node mchello".

8. Motechat hello program will register to device center, send a message to self (EiName) and echo this message.
 