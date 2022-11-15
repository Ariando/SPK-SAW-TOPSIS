<?php $this->load->view('layouts/header_admin'); ?>

<div class="d-sm-flex align-items-center justify-content-between mb-4">
	<h1 class="h3 mb-0 text-gray-800"><i class="fas fa-fw fa-users"></i> Data Proposal</h1>

	<a href="<?= base_url('Alternatif'); ?>" class="btn btn-secondary btn-icon-split"><span class="icon text-white-50"><i class="fas fa-arrow-left"></i></span>
		<span class="text">Kembali</span>
	</a>
</div>

<div class="card shadow mb-4">
	<div class="card-header py-3">
		<h6 class="m-0 font-weight-bold text-danger"><i class="fas fa-fw fa-edit"></i> Edit Data Proposal</h6>
	</div>

	<?php echo form_open('Alternatif/update/' . $alternatif->id_alternatif); ?>
	<div class="card-body">
		<div class="row">
			<?php echo form_hidden('id_alternatif', $alternatif->id_alternatif) ?>
			<div class="form-group col-md-12">
				<label class="font-weight-bold">Judul</label>
				<input autocomplete="off" type="text" name="nama" value="<?php echo $alternatif->nama ?>" required class="form-control" />
			</div>
			<div class="form-group col-md-12">
				<label class="font-weight-bold">Nama Mahasiswa</label>
				<input autocomplete="off" type="text" name="mahasiswa" value="<?php echo $alternatif->mahasiswa ?>" required class="form-control" />
			</div>
			<div class="form-group col-md-12">
				<label class="font-weight-bold">NIM</label>
				<input autocomplete="off" type="text" name="nim" value="<?php echo $alternatif->nim ?>" required class="form-control" />
			</div>
			<div class="form-group col-md-12">
				<label class="font-weight-bold">Konsentrasi</label>
				<select name="konsentrasi" class="form-control" required>
					<option value="Software Engineering" <?php if ($alternatif->konsentrasi == "Software Engineering") {
																echo 'selected';
															} ?>>Software Engineering</option>
					<option value="Security And Network" <?php if ($alternatif->konsentrasi == "Security And Network") {
													echo 'selected';
												} ?>>Security And Network</option>
					<option value="Soft Computing" <?php if ($alternatif->konsentrasi == "Soft Computing") {
														echo 'selected';
													} ?>>Soft Computing</option>
				</select>
			</div>
		</div>
	</div>
	<div class="card-footer text-right">
		<button type="submit" class="btn btn-success"><i class="fa fa-save"></i> Simpan</button>
		<button type="reset" class="btn btn-info"><i class="fa fa-sync-alt"></i> Reset</button>
	</div>
	<?php echo form_close() ?>
</div>

<?php $this->load->view('layouts/footer_admin'); ?>