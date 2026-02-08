# MVP Akis Standardi (Sessiz Ortak)

## 1) �r�n�n Varlik Amaci (Degismez)

Bu uygulama, kullanicinin yalniz hissetmeden, karmasaya bogulmadan ve en fazla 30 saniyede odaklanmaya baslamasini saglar.
Uygulama �gretmez, zorlamaz, yormaz; sadece eslik eder.

"Uygulama beni degil, ben uygulamayi kontrol ediyorum" hissi kutsaldir.

## 2) Kullanici Psikolojisi (Kilit)

Kullanici:

- Uygulamaya isteksiz ama umutlu gelir.
- Uzun onboarding�den nefret eder.
- Ayarlarla bogulmak istemez.
- Kontrol hissini kaybetmek istemez.

Bu y�zden:

- A�iklama duvarlari yok.
- 5+ adimli onboarding yok.
- "Sonra ayarlarsin" tuzaklari yok.

## 3) Zorunlu MVP Ekranlari (Degistirilemez)

### 1) Onboarding (Step-Based, 2 Adim)

Ama�: Kullaniciyi 30 saniyede kisisellestirmek ve ilk odaga sokmak.

Adim 1 � Tanisma

- Isim
- Avatar se�imi

�ikti:

- Kullanici "ben buradayim" der.

Adim 2 � Odak Tercihleri

- Odak s�resi (25 / 50 dk � default: 25)
- Arka plan (Sessiz / Lofi / Klasik)

�ikti:

- Default Focus Preset olusturulur.

Kural:

- Onboarding iki adimi ge�emez.
- Yeni tercihler = Profile/Settings ekraninda g�ncellenir.

Not:

- Bu se�imler �sonra ayarlarsin� tuzagi degildir; kullaniciya kontrol hissi verir.

### 2) Dashboard (Merkez Ekran)

Dashboard bir men� degil, bir karar noktasidir.

Zorunlu CTA�lar:

- Hemen Basla
- Profilim
- Yardim

Kurallar:

- Ayni anda en fazla 3 ana se�enek.
- Kullanici hi�bir yere kilitlenmis hissetmez.
- �Ne yapacagimi bilmiyorum� ani olusmaz.

### 3) Profile / Settings (MVP�de Sart)

Kullanici kontrol hissi ister.

I�erik:

- Isim / avatar
- Odak s�resi
- M�zik tercihi

Mimari kural:

- Profile = �Ben�
- Settings = �Nasil �alisiyor�
- (Simdilik ayni ekranda olabilir ama mantik ayrimi korunur.)

### 4) Help / FAQ (Retention Kritik)

Help ekrani l�ks degil, g�ven katmanidir.

Minimum i�erik (component bazli):

- Bu uygulama ne yapar?
- Sessiz Ortak nedir?
- Odak oturumu nasil isler?
- Sorun yasarsam ne yaparim?

### 5) Bottom Nav (�r�n Odakli)

Bottom nav = her an ka�is kapisi.

MVP:

- Dashboard
- Focus
- Profile
- Help

Kural:

- Library gibi secondary ekranlar bottom nav�a girmez.

## 4) Teknik ve Mimari Kilitler

- Onboarding: step-array mantigi.
- Navigation: route-first (ekran degil, yol).
- Her ekran su soruya cevap vermeli: �Bu ekran 10x kullanicida da mantikli mi?�

## 5) 1 Yil Sonra �ikacak Hatalar ve �nlemler

- Feature var ama bulunmuyor ? Bottom nav + route standardi
- Onboarding sisti ? Step-based, mod�ler yapi
- Ayarlar karmasik ? Profile / Settings ayrimi
- Help ��pl�k oldu ? Component + �l��m
- MVP ? V2 sancili ? MVP�yi �ge�ici� yapmamak

## 6) Altin Kural (Kilit C�mle)

Kod degisir, tasarim degisir, ama akis degismez.

## 7) Onboarding Micro-Copy (Hazir)

Splash / Ilk Karsilama

- �Yalniz degilsin. Baslayalim.�

Onboarding � Adim 1

- Baslik: �Seni taniyalim�
- Alt metin: �Bu ekran senin i�in.�
- Buton: �Devam et�

Onboarding � Adim 2

- Baslik: �Nasil odaklanmak istersin?�
- Alt metin: �Istedigin zaman Profil�den degistirebilirsin.�
- Buton: �Hazirim�

## 8) Dashboard Micro-Copy

Ana baslik:

- �Hazirsan basliyoruz.�

CTA � Hemen Basla:

- �Hemen Basla�
- Alt a�iklama (k���k): �Sessizce eslik edecegim.�

Profil:

- �Profilim�
- Alt: �Sana �zel ayarlar�

Help:

- �Yardim�
- Alt: �Nasil �alistigini �gren�

## 9) KPI (MVP)

- Dashboard ? Session start s�resi �l��l�r: `dashboard_to_session_start_ms`
- Hedef: = 30 saniye
