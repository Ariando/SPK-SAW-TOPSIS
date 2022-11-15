<?php

use phpDocumentor\Reflection\Types\This;

$this->load->view('layouts/header_admin'); ?>

<!-- Judul Perhitungan Metode -->
<div class="d-sm-flex align-items-center justify-content-between mb-4">
	<h1 class="h3 mb-0 text-gray-800"><i class="fas fa-fw fa-calculator"></i>Perhitungan
		<?php if (isset($_POST['hitung'])) {
			if ($_POST['metode'] == "saw") {
				echo "Metode SAW";
			}
		} ?>
		<?php if (isset($_POST['hitung'])) {
			if ($_POST['metode'] == "topsis") {
				echo "Metode TOPSIS";
			}
		} ?>
		<?php if (isset($_POST['hitung'])) {
			if ($_POST['metode'] == "wp") {
				echo "Metode WP";
			}
		} ?>
	</h1>
</div>

<!-- Tombol Dropdown Metode -->
<div class="card shadow mb-4">
	<!-- /.card-header -->
	<div class="card-header py-3">
		<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Hitung Berdasarkan Metode</h6>
	</div>

	<div class="card-body">
		<form action="<?= base_url('Perhitungan'); ?>" method="POST">
			<div class="row">
				<div class="input-group mb-3 col-10">
					<div class="input-group-prepend">
						<label class="input-group-text" for="inputGroupSelect01">Pilih Metode</label>
					</div>
					<select name="metode" class="custom-select" required>
						<option value="">--Pilih Metode Perhitungan--</option>
						<option value="saw" <?php if (isset($_POST['hitung'])) {
												if ($_POST['metode'] == "saw") {
													echo "selected";
												}
											} ?>>Perhitungan Metode SAW</option>
						<option value="wp" <?php if (isset($_POST['hitung'])) {
												if ($_POST['metode'] == "wp") {
													echo "selected";
												}
											} ?>> Perhitungan Metode WP</option>
						<option value="topsis" <?php if (isset($_POST['hitung'])) {
													if ($_POST['metode'] == "topsis") {
														echo "selected";
													}
												} ?>>Perhitungan Metode TOPSIS</option>
					</select>
				</div>

				<div class="col-2">
					<button name="hitung" type="submit" class="btn btn-success w-100"><i class="fa fa-search"></i> Hitung</button>
				</div>
			</div>
		</form>
	</div>
</div>

<!-- Perhitungan Metode SAW -->
<?php
if (isset($_POST['hitung'])) {
	if ($_POST['metode'] == "saw") {
?>

		<!-- Matriks Keputusan X -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Matrix Keputusan (X)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-danger text-white">
							<tr align="center">
								<th width="5%" rowspan="2">No</th>
								<th width="30%">Judul Proposal</th>
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?></th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<?php
							$no = 1;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php foreach ($kriteria as $key) : ?>
										<td>
											<?php
											$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
											echo $data_pencocokan['nilai'];
											?>
										</td>
									<?php endforeach ?>
								</tr>
							<?php
								$no++;
							endforeach
							?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Bobot Kriteria W -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Bobot Kriteria (W)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-danger text-white">
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?> (<?= $key->jenis ?>)</th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<td>
										<?php
										echo $key->bobot;
										?>
									</td>
								<?php endforeach ?>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Matriks Ternormalisasi R -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Matrix Ternormalisasi (R)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-danger text-white">
							<tr align="center">
								<th width="5%" rowspan="2">No</th>
								<th width="30%">Judul Proposal</th>
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?></th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<?php
							$no = 1;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php foreach ($kriteria as $key) : ?>
										<td>
											<?php
											$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
											$min_max = $this->Perhitungan_model->get_max_min($key->id_kriteria);
											if ($min_max['jenis'] == 'Benefit') {
												echo round(@($data_pencocokan['nilai'] / $min_max['max']), 4);
											} else {
												echo round(@($min_max['min'] / $data_pencocokan['nilai']), 4);
											}
											?>
										</td>
									<?php endforeach ?>
								</tr>
							<?php
								$no++;
							endforeach ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Nilai Vi -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Perhitungan Nilai (Vi)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-danger text-white">
							<tr align="center">
								<th width="5%">No</th>
								<th width="50%">Judul Proposal</th>
								<th width="15%">Nilai Vi</th>
							</tr>
						</thead>
						<tbody>
							<?php
							$this->Perhitungan_model->hapus_hasil_saw();
							$no = 1;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td align="center"><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php
									$nilai_v = 0;
									foreach ($kriteria as $key) : ?>
									<?php
										$bobot = $key->bobot;
										$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
										$min_max = $this->Perhitungan_model->get_max_min($key->id_kriteria);
										if ($min_max['jenis'] == 'Benefit') {
											$nilai_r = @($data_pencocokan['nilai'] / $min_max['max']);
										} else {
											$nilai_r = @($min_max['min'] / $data_pencocokan['nilai']);
										}
										$nilai_penjumlahan = $bobot * $nilai_r;
										$nilai_v += $nilai_penjumlahan;
									endforeach; ?>
									<td>
										<?php
										echo round($nilai_v, 4);
										$hasil_akhir = [
											'id_alternatif' => $keys->id_alternatif,
											'nilai' => $nilai_v
										];
										$this->Perhitungan_model->insert_hasil_saw($hasil_akhir);
										?>
									</td>
								</tr>
							<?php
								$no++;
							endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Hasil Akhir SAW -->
			<div class="card shadow mb-4">
				<!-- /.card-header -->
				<div class="card-header py-3">
					<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Hasil Akhir SAW</h6>
				</div>

				<div class="card-body">
					<div class="table-responsive">
						<table class="table table-bordered" width="100%" cellspacing="0">
							<thead class="bg-danger text-white">
								<tr align="center">
									<th width="70%">Judul Proposal</th>
									<th width="20%">Nilai</th>
									<th>Rank</th>
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
											echo substr($nama_alternatif['nama'], 0, 75);
											?>
										...
										</td>
										<td><?= round($keys->nilai, 4) ?></td>
										<td><?= $no; ?></td>
									</tr>
								<?php
									$no++;
								endforeach ?>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		
		<!-- Metode TOPSIS -->
	<?php
	} elseif ($_POST['metode'] == "topsis") {
	?>

		<!-- Matriks Keputusan X -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Matrik Keputusan (X)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-success text-white">
							<tr align="center">
								<th width="5%">No</th>
								<th width="30%">Judul Proposal</th>
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?></th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<?php
							$no = 1;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php foreach ($kriteria as $key) : ?>
										<td>
											<?php
											$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
											echo $data_pencocokan['nilai'];
											?>
										</td>
									<?php endforeach ?>
								</tr>
							<?php
								$no++;
							endforeach
							?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Bobot kriteria W -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Bobot Kriteria (W)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-success text-white">
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?></th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<td>
										<?php
										echo $key->bobot;
										?>
									</td>
								<?php endforeach ?>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Matriks Normalisasi R -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Matriks Normalisasi (R)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-success text-white">
							<tr align="center">
								<th width="5%">No</th>
								<th width="30%">Judul Proposal</th>
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?></th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<?php
							$no = 1;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php
									foreach ($kriteria as $key) {
										$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
										$data_pangkat = $this->Perhitungan_model->get_total_pangkat($key->id_kriteria);

										$n = @($data_pencocokan['nilai'] / sqrt($data_pangkat['nilai']));
										$nh = round($n, 4);
										echo "<td>" . $nh . "</td>";
									}
									?>
								</tr>
							<?php
								$no++;
							endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Matriks Y -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Matriks Normalisasi V</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-success text-white">
							<tr align="center">
								<th width="5%">No</th>
								<th width="30%">Judul Proposal</th>
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?></th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<?php
							$no = 1;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php
									foreach ($kriteria as $key) {
										$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
										$data_pangkat = $this->Perhitungan_model->get_total_pangkat($key->id_kriteria);
										$bobot = $key->bobot;

										$hs = @($bobot * ($data_pencocokan['nilai'] / sqrt($data_pangkat['nilai'])));
										$hsl = round($hs, 4);
										echo "<td>" . $hsl . "</td>";
									}
									?>
								</tr>
							<?php
								$no++;
							endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Solusi Ideal Positif -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Solusi Ideal Positif (A<sup>+</sup>)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-success text-white">
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?></th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<td>
										<?php
										if ($key->jenis == "Benefit") {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											echo $min_max['max'];
										} else {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											echo $min_max['min'];
										}
										?>
									</td>
								<?php endforeach ?>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Solusi Ideal Negatif -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Solusi Ideal Negatif (A<sup>-</sup>)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-success text-white">
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?></th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<td>
										<?php
										if ($key->jenis == "Benefit") {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											echo $min_max['min'];
										} else {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											echo $min_max['max'];
										}
										?>
									</td>
								<?php endforeach ?>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Jarak Ideal Positif -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Jarak Ideal Positif (S<sub>i</sub><sup>+</sup>)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-success text-white">
							<tr align="center">
								<th width="5%">No</th>
								<th>Judul Proposal</th>
								<th width="30%">Jarak Ideal Positif</th>
							</tr>
						</thead>
						<tbody>
							<?php
							$no = 1;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php
									$jumlah_kuadrat_jip = 0;
									foreach ($kriteria as $key) {

										if ($key->jenis == "Benefit") {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											$s_positif = $min_max['max'];
										} else {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											$s_positif = $min_max['min'];
										}

										$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
										$data_pangkat = $this->Perhitungan_model->get_total_pangkat($key->id_kriteria);
										$bobot = $key->bobot;

										$hs = @($bobot * ($data_pencocokan['nilai'] / sqrt($data_pangkat['nilai'])));
										$hsl_pengurangan_jip = $hs - $s_positif;
										$jumlah_kuadrat_jip += pow($hsl_pengurangan_jip, 2);
									}
									$akar_kuadrat_jip = sqrt($jumlah_kuadrat_jip);
									echo "<td>" . round($akar_kuadrat_jip, 4) . "</td>";
									?>
								</tr>
							<?php
								$no++;
							endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Jarak Ideal Negatif -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Jarak Ideal Negatif (S<sub>i</sub><sup>-</sup>)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-success text-white">
							<tr align="center">
								<th width="5%">No</th>
								<th>Judul Proposal</th>
								<th width="30%">Jarak Ideal Negatif</th>
							</tr>
						</thead>
						<tbody>
							<?php
							$no = 1;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php
									$jumlah_kuadrat_jin = 0;
									foreach ($kriteria as $key) {

										if ($key->jenis == "Benefit") {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											$s_negatif = $min_max['min'];
										} else {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											$s_negatif = $min_max['max'];
										}

										$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
										$data_pangkat = $this->Perhitungan_model->get_total_pangkat($key->id_kriteria);
										$bobot = $key->bobot;

										$hsn = @($bobot * ($data_pencocokan['nilai'] / sqrt($data_pangkat['nilai'])));
										$hsl_pengurangan_jin = $hsn - $s_negatif;
										$jumlah_kuadrat_jin += pow($hsl_pengurangan_jin, 2);
									}
									$akar_kuadrat_jin = sqrt($jumlah_kuadrat_jin);
									echo "<td>" . round($akar_kuadrat_jin, 4) . "</td>";
									?>
								</tr>
							<?php
								$no++;
							endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Kedekatan Relatif terhadap Solusi Ideal -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Kedekatan Relatif Terhadap Solusi Ideal (V)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-success text-white">
							<tr align="center">
								<th width="5%">No</th>
								<th>Judul Proposal</th>
								<th width="30%">Nilai</th>
							</tr>
						</thead>
						<tbody>
							<?php
							$no = 1;
							$this->Perhitungan_model->hapus_hasil_topsis();
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php
									$jumlah_kuadrat_jip = 0;
									$jumlah_kuadrat_jin = 0;
									foreach ($kriteria as $key) {

										if ($key->jenis == "Benefit") {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											$s_positif = $min_max['max'];
										} else {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											$s_positif = $min_max['min'];
										}

										if ($key->jenis == "Benefit") {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											$s_negatif = $min_max['min'];
										} else {
											$min_max = $this->Perhitungan_model->get_max_min_y($key->id_kriteria);
											$s_negatif = $min_max['max'];
										}

										$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
										$data_pangkat = $this->Perhitungan_model->get_total_pangkat($key->id_kriteria);
										$bobot = $key->bobot;

										$hs = @($bobot * ($data_pencocokan['nilai'] / sqrt($data_pangkat['nilai'])));
										$hsl_pengurangan_jip = $hs - $s_positif;
										$jumlah_kuadrat_jip += pow($hsl_pengurangan_jip, 2);

										$hsn = @($bobot * ($data_pencocokan['nilai'] / sqrt($data_pangkat['nilai'])));
										$hsl_pengurangan_jin = $hsn - $s_negatif;
										$jumlah_kuadrat_jin += pow($hsl_pengurangan_jin, 2);
									}
									$akar_kuadrat_jip = sqrt($jumlah_kuadrat_jip);
									$akar_kuadrat_jin = sqrt($jumlah_kuadrat_jin);

									$nilai_v = $akar_kuadrat_jin / ($akar_kuadrat_jip + $akar_kuadrat_jin);
									$hasil_akhir = [
										'id_alternatif' => $keys->id_alternatif,
										'nilai' => round($nilai_v, 4)
									];
									$result = $this->Perhitungan_model->insert_hasil_topsis($hasil_akhir);
									echo "<td>" . round($nilai_v, 4) . "</td>";
									?>
								</tr>
							<?php
								$no++;
							endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Hasil Akhir TOPSIS -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Hasil Akhir TOPSIS</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-success text-white">
							<tr align="center">
								<th width="70%">Judul Proposal</th>
								<th width="20%">Nilai</th>
								<th>Rank</th>
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
										echo substr($nama_alternatif['nama'], 0, 75) ;
										?>
									...
									</td>
									<td><?= $keys->nilai ?></td>
									<td><?= $no; ?></td>
								</tr>
							<?php
								$no++;
							endforeach ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Metode WP -->
	<?php
	} else {
	?>
		<!-- Matriks Keputusan X -->
		<div class="card shadow mb-4">
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Matriks Keputusan (X)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-info text-white">
							<tr align="center">
								<th width="5%">No</th>
								<th width="40%">Judul Proposal</th>
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?></th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<?php
							$no = 1;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php foreach ($kriteria as $key) : ?>
										<td>
											<?php
											$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
											echo $data_pencocokan['nilai'];
											?>
										</td>
									<?php endforeach ?>
								</tr>
							<?php
								$no++;
							endforeach
							?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Bobot kriteria W -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Bobot Kriteria (W)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-info text-white">
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?> (<?= $key->jenis ?>)</th>
								<?php endforeach ?>
							</tr>
						</thead>
						<tbody>
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<td>
										<?php
										echo $key->bobot;
										?>
									</td>
								<?php endforeach ?>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Normalisasi Bobot kriteria W -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Normalisasi Bobot Kriteria (W)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-info text-white">
							<tr align="center">
								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria ?> (<?= $key->jenis ?>)</th>
								<?php endforeach ?>
								<th>Jumlah</th>
							</tr>
						</thead>
						<tbody>
							<tr align="center">

								<?php foreach ($kriteria as $key) :

								?>
									<td>
										<?php
										$bbt = $this->Perhitungan_model->get_sum_bobot();

										$bobotw[] = $key->bobot / $bbt['total_bobot'];

										echo $key->bobot / $bbt['total_bobot'];
										?>
									</td>
								<?php endforeach ?>
								<td><?= array_sum($bobotw); ?></td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Vetor S -->
		<div class="card shadow mb-4">
			<div class="card-header py-4">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Nilai Vektor (S)</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="text-white bg-info">
							<tr align="center">
								<th width="5%" rowspan="2">No</th>
								<th width="30%" rowspan="2">Judul Proposal</th>
								<th colspan="5">
									Kriteria
								</th>
								<th rowspan="2">Nilai S</th>
							</tr>
							<tr align="center">

								<?php foreach ($kriteria as $key) : ?>
									<th><?= $key->kode_kriteria  ?></th>
								<?php endforeach ?>
							</tr>
							<tr align="center">

						</thead>
						<tbody>
							<?php
							$no = 1;
							$total_vs = 0;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php
									$total_s = 1;
									foreach ($kriteria as $key) : ?>
										<td>
											<?php
											$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
											$total_bobot = $this->Perhitungan_model->get_sum_bobot();
											if ($key->jenis == "Benefit") {
												$bobot_r = @(($key->bobot / $total_bobot['total_bobot']) * 1);
												$nilai_s = pow($data_pencocokan['nilai'], $bobot_r);
												echo round($nilai_s, 4);
											} else {
												$bobot_r = @(($key->bobot / $total_bobot['total_bobot']) * -1);
												$nilai_s = pow($data_pencocokan['nilai'], $bobot_r);
												echo round($nilai_s, 4);
											}
											$total_s *= $nilai_s;
											?>
										</td>
									<?php endforeach; ?>
									<td><?= round($total_s, 4); ?></td>
								</tr>
							<?php
								$total_vs += $total_s;
								$no++;
							endforeach;
							?>
							<tr align="center">
								<td colspan="7" class="bg-light">Total</td>
								<td class="bg-light"><?= round($total_vs, 4); ?></td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Vektor V -->
		<div class="card shadow mb-4">
			<div class="card-header py-4">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Nilai Vektor V </h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-info text-white">
							<tr align="center">
								<th width="5%">No</th>
								<th width="50%">Judul Proposal</th>
								<th>Perhitungan</th>
								<th width="15%">Nilai (V)</th>
							</tr>
						</thead>
						<tbody>
							<?php
							$this->Perhitungan_model->hapus_hasil_wp();
							$no = 1;
							foreach ($alternatif as $keys) : ?>
								<tr align="center">
									<td><?= $no; ?></td>
									<td align="left"><?= $keys->nama ?></td>
									<?php
									$total_s = 1;
									foreach ($kriteria as $key) : ?>
										<?php
										$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
										$total_bobot = $this->Perhitungan_model->get_sum_bobot();
										if ($key->jenis == "Benefit") {
											$bobot_r = @(($key->bobot / $total_bobot['total_bobot']) * 1);
											$nilai_s = pow($data_pencocokan['nilai'], $bobot_r);
										} else {
											$bobot_r = @(($key->bobot / $total_bobot['total_bobot']) * -1);
											$nilai_s = pow($data_pencocokan['nilai'], $bobot_r);
										}
										$total_s *= $nilai_s;
										?>
									<?php endforeach; ?>
									<td><?= round($total_s, 4); ?> / <?= round($total_vs, 4); ?></td>
									<td><?= round($nilai_v = $total_s / $total_vs, 4); ?></td>
								</tr>
							<?php
								$hasil_akhir = [
									'id_alternatif' => $keys->id_alternatif,
									'nilai' => round($nilai_v, 4)
								];
								$this->Perhitungan_model->insert_hasil_wp($hasil_akhir);
								$no++;
							endforeach;
							?>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Nilai Akhir WP -->
		<div class="card shadow mb-4">
			<!-- /.card-header -->
			<div class="card-header py-3">
				<h6 class="m-0 font-weight-bold text-dark"><i class="fa fa-table"></i> Hasil Akhir WP</h6>
			</div>

			<div class="card-body">
				<div class="table-responsive">
					<table class="table table-bordered" width="100%" cellspacing="0">
						<thead class="bg-info text-white">
							<tr align="center">
								<th width="70%">Judul Proposal</th>
								<th width="20%">Nilai</th>
								<th>Rank</th>
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
										echo substr($nama_alternatif['nama'], 0, 75);
										?>

									</td>
									<td><?= round($keys->nilai, 4) ?></td>
									<td><?= $no; ?></td>
								</tr>
							<?php
								$no++;
							endforeach ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>					

<?php
	}
}
$this->load->view('layouts/footer_admin');
?>