# Assignment Case CSV Fixtures

Bu klasor, atama algoritmasi icin kayitli CSV datasetlerini icerir. Her case ayni dosya yapisini kullanir:

- `departments.csv`: case icindeki bolumler
- `faculty.csv`: hocalar, bolumleri ve aktiflikleri
- `students.csv`: ogrenciler, GANO ve onay durumlari
- `preferences.csv`: ogrenci tercih siralari
- `expected_summary.csv`: runner tarafindan dogrulanacak beklenen ozet

Tum case'leri calistirma:

```bash
node docs/assignment_case_runner.cjs --all
```

Tek case calistirma:

```bash
node docs/assignment_case_runner.cjs --case 04_computer_engineering_110
```

Fixture'lari deterministik olarak yeniden uretmek icin:

```bash
node docs/generate_assignment_cases.cjs
```

Ana case'ler:

- `01_popular_two_advisors`: iki hocanin yogun talep gordugu YZVM senaryosu
- `02_happy_path_equal`: 40 ogrencinin 4 hocaya esit dagildigi happy path
- `03_yzvm_40_realistic`: YZVM icin 40 kisilik dengesiz tercih senaryosu
- `04_computer_engineering_110`: Bilgisayar Muhendisligi icin 110 ogrenci / 10 hoca senaryosu
- `05_capacity_*`: 100, 500, 1000 ve 5000 ogrencilik kapasite ramp setleri

Ek edge-case'ler pending/rejected ogrenci, pasif hoca, fallback, tie-break ve cok bolum izolasyonunu kapsar.
