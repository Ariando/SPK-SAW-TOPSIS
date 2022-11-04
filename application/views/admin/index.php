<?php $this->load->view('layouts/header_admin'); ?>

<?php if ($this->session->userdata('id_user_level') == '1') : ?>
    <div class="mb-4">
        <!-- Page Heading -->
        <div class="d-sm-flex align-items-center justify-content-between mb-4">
            <h1 class="h3 mb-0 text-gray-800"><i class="fas fa-fw fa-home"></i> Dashboard</h1>
        </div>

        <!-- Content Row -->
        <div class="alert alert-success">
            <button type="button" class="close" data-dismiss="alert" aria-hidden="true">×</button>
            Selamat datang <span class="text-uppercase"><b><?= $this->session->username; ?>!</b></span> Anda bisa mengoperasikan sistem dengan wewenang tertentu melalui pilihan menu di bawah.
        </div>

        <!-- Menu Tombol Dashboard -->
        <div class="row" style="height: 200px; ;">

            <div class="col-xl-4 col-md-6 mb-4">
                <div class="card border-left-info shadow h-100 py-2">
                    <div class="card-body mx-0">
                        <div class="row no-gutters align-items-center justify-content-between">
                            <div class="col-auto">
                                <i class="fas fa-cube fa-8x text-info"></i>
                            </div>
                            <div class="col-auto">
                                <div class="h1 mb-0 font-weight-bolder text-black-100">
                                    <h1 class="font-weight-bolder display-1 text-center">
                                <?php
                                        $mysqli = new mysqli("localhost","root","","spk_saw_topsis_ci");
                                        // Check connection
                                        if ($mysqli -> connect_errno) {
                                        echo "Failed to connect to MySQL: " . $mysqli -> connect_error;
                                        exit();
                                        }
                                        // Perform query
                                        if ($result = $mysqli -> query("SELECT * FROM kriteria")) {
                                        echo $result -> num_rows;
                                        // Free result set
                                        $result -> free_result();
                                        }
                                        $mysqli -> close();
                                ?>
                                    </h1>
                                </div>
                                <div class="h5 mb-0 font-weight-bold text-center">
                                    <a href="<?= base_url('Kriteria'); ?> " class="text-info text-decoration-none">Jumlah Kriteria</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-xl-4 col-md-6 mb-4">
                <div class="card border-left-primary shadow h-100 py-2">
                    <div class="card-body">
                        <div class="row no-gutters align-items-center justify-content-between">
                        <div class="col-auto">
                                <i class="fas fa-cubes fa-8x text-primary"></i>
                            </div>
                        <div class="col-auto">
                            <div class="h1 mb-0 font-weight-bolder text-black-100">
                            <h1 class="font-weight-bolder display-1 text-center">
                            <?php
                                        $mysqli = new mysqli("localhost","root","","spk_saw_topsis_ci");

                                        // Check connection
                                        if ($mysqli -> connect_errno) {
                                        echo "Failed to connect to MySQL: " . $mysqli -> connect_error;
                                        exit();
                                        }

                                        // Perform query
                                        if ($result = $mysqli -> query("SELECT * FROM sub_kriteria")) {
                                        echo $result -> num_rows;
                                        // Free result set
                                        $result -> free_result();
                                        }

                                        $mysqli -> close();
                                ?>
                            </h1>
                            <div class="h5 mb-0 font-weight-bold text-gray-800"><a href="<?= base_url('Sub_Kriteria'); ?>" class="text-primary text-decoration-none">Jumlah Subkriteria</a>
                            </div>
                            </div>

                            
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-xl-4 col-md-6 mb-4">
                <div class="card border-left-success shadow h-100 py-2">
                    <div class="card-body">
                        <div class="row no-gutters align-items-center justify-content-between">
                            <div class="col-auto">
                                <i class="fas fa-users  fa-8x text-success"></i>
                            </div>
                            <div class="col-auto">
                                <div class="h1 mb-0 font-weight-bolder text-black-100">
                                <h1 class="font-weight-bolder display-1 text-center">
                                <?php
                                        $mysqli = new mysqli("localhost","root","","spk_saw_topsis_ci");

                                        // Check connection
                                        if ($mysqli -> connect_errno) {
                                        echo "Failed to connect to MySQL: " . $mysqli -> connect_error;
                                        exit();
                                        }

                                        // Perform query
                                        if ($result = $mysqli -> query("SELECT * FROM alternatif")) {
                                        echo $result -> num_rows;
                                        // Free result set
                                        $result -> free_result();
                                        }

                                        $mysqli -> close();
                                ?>
                                </h1>
                                <div class="h5 mb-0 font-weight-bold text-gray-800">
                                    <a href="<?= base_url('Alternatif'); ?>" class="text-success text-decoration-none">Jumlah Proposal</a>
                                </div>
                                </div>
                            </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    <?php endif; ?>
    <?php if ($this->session->userdata('id_user_level') == '2') : ?>
        <div class="mb-4">
            <!-- Page Heading -->
            <div class="d-sm-flex align-items-center justify-content-between mb-4">
                <h1 class="h3 mb-0 text-gray-800"><i class="fas fa-fw fa-home"></i> Dashboard</h1>
            </div>

            <!-- Content Row -->
            <div class="alert alert-success">
                <button type="button" class="close" data-dismiss="alert" aria-hidden="true">×</button>
                Selamat datang <span class="text-uppercase"><b><?= $this->session->username; ?>!</b></span> Anda bisa mengoperasikan sistem dengan wewenang tertentu melalui pilihan menu di bawah.
            </div>
            <div class="row">

                <div class="col-xl-4 col-md-6 mb-4">
                    <div class="card border-left-info shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="h5 mb-0 font-weight-bold text-gray-800"><a href="<?= base_url('Login/home'); ?>" class="text-secondary text-decoration-none">Dashboard</a></div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-home fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-xl-4 col-md-6 mb-4">
                    <div class="card border-left-primary shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="h5 mb-0 font-weight-bold text-gray-800"><a href="<?= base_url('Perhitungan/hasil'); ?>" class="text-secondary text-decoration-none">Data Hasil Akhir</a></div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-chart-area fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-xl-4 col-md-6 mb-4">
                    <div class="card border-left-success shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="h5 mb-0 font-weight-bold text-gray-800"><a href="<?= base_url('Profile'); ?>" class="text-secondary text-decoration-none">Data Profile</a></div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-user fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    <?php endif; ?>

    <?php $this->load->view('layouts/footer_admin'); ?>