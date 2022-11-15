<?php $this->load->view('layouts/header_admin'); ?>

<div class="d-sm-flex align-items-center justify-content-between mb-4">
	<h1 class="h3 mb-0 text-gray-800"><i class="fas fa-fw fa-chart-area"></i>Hasil Akhir</h1>

	<a href="<?= base_url('Laporan/cetak_laporan_hasil'); ?>" class="btn btn-primary"> <i class="fa fa-print"></i> Cetak Data </a>
</div>

<div class="row">
	<div class="col-md-4">
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
										echo $nama_alternatif['nama'];
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

	<div class="col-md-4">
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
										echo $nama_alternatif['nama'];
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

	<div class="col-md-4">
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
				</div>
			</div>
		</div>
	</div>


</div>



<?php
$this->load->view('layouts/footer_admin');
?>