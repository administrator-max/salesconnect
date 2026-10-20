' Menjalankan tools/penjaga_server.sh TANPA jendela konsol (dipanggil Task Scheduler
' "SalesConnect Penjaga" tiap 10 menit). Hanya membaca server; tidak mengupload apa pun.
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
bash = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Git\bin\bash.exe"
cmd = """" & bash & """ -lc ""cd '" & Replace(repo, "\", "/") & "' && tools/penjaga_server.sh"""
CreateObject("WScript.Shell").Run cmd, 0, True
