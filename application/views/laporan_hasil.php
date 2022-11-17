<!DOCTYPE html>
<html>

<head>
	<title>Sistem Pendukung Keputusan Metode SAW TOPSIS</title>
</head>
<style>
	table {
		border-collapse: collapse;
	}

	table,
	th,
	td {
		border: 1px solid black;
	}
</style>

<body>
	<!-- Tabel Hasil Metode SAW -->
	<h4>Hasil Akhir Perankingan SAW</h4>
	<table border="1" width="100%">
		<thead>
			<tr align="center">
				<th>Judul Proposal Skripsi</th>
				<th>Nilai</th>
				<th width="15%">Rank</th>
			</tr>
		</thead>
		<tbody>
			<?php
			$no = 1;
			foreach ($hasil_saw as $keys) : ?>
				<tr align="center">
					<td align="left">
						<?php
						$nama_alternatif = $this->Perhitungan_model->get_hasil_alternatif($keys->id_alternatif);
						echo $nama_alternatif['nama'];
						?>

					</td>
					<td><?= $keys->nilai ?></td>
					<td><?= $no; ?></td>
				</tr>
			<?php
				$no++;
			endforeach ?>
		</tbody>
	</table>

	<!-- Tabel Hasil Metode WP -->
	<h4>Hasil Akhir Perankingan WP</h4>
	<table border="1" width="100%">
		<thead>
			<tr align="center">
				<th>Judul Proposal Skripsi</th>
				<th>Nilai</th>
				<th width="15%">Rank</th>
			</tr>
		</thead>
		<tbody>
			<?php
			$no = 1;
			foreach ($hasil_wp as $keys) : ?>
				<tr align="center">
					<td align="left">
						<?php
						$nama_alternatif = $this->Perhitungan_model->get_hasil_alternatif($keys->id_alternatif);
						echo $nama_alternatif['nama'];
						?>

					</td>
					<td><?= $keys->nilai ?></td>
					<td><?= $no; ?></td>
				</tr>
			<?php
				$no++;
			endforeach ?>
		</tbody>
	</table>

	<!-- Tabel hasil metode TOPSIS -->
	<h4>Hasil Akhir Perankingan TOPSIS</h4>
	<table border="1" width="100%">
		<thead>
			<tr align="center">
			<th>Judul Proposal Skripsi</th>
				<th>Nilai</th>
				<th width="15%">Rank</th>
			</tr>
		</thead>
		<tbody>
			<?php
			$no = 1;
			foreach ($hasil_topsis as $keys) : ?>
				<tr align="center">
					<td align="left">
						<?php
						$nama_alternatif = $this->Perhitungan_model->get_hasil_alternatif($keys->id_alternatif);
						echo $nama_alternatif['nama'];
						?>

					</td>
					<td><?= $keys->nilai ?></td>
					<td><?= $no; ?></td>
				</tr>
			<?php
				$no++;
			endforeach ?>
		</tbody>
	</table>
</body>

</html>